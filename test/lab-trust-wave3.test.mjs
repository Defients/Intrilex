import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { trustedSummary, currentIdentity } from './fixtures/admission-fixtures.mjs';
import { hashCanonical } from '../packages/shared/src/canonical.mjs';
import { admitSummaries, selectEvidence, analyticsSummaries, publishEvidenceSnapshot, markEvidenceSnapshotStale } from '../packages/simulation-runtime/src/evidence-admission.mjs';
import { createRunRecord, payloadEvidenceHash } from '../packages/simulation-runtime/src/experiment-domain.mjs';
import { validateExperimentRunArtifact, experimentRunArtifact, runDecisionFidelity, replayCoverageForSummaries } from '../packages/simulation-runtime/src/experiment-portability.mjs';
import { observatorySummaryForRecord } from '../packages/simulation-runtime/src/observatory-bridge.mjs';
import { baselinePolicyState, WEIGHTED_POLICY_ID } from '../packages/policies/src/weighted-heuristic.mjs';
import { sampleIdentity, outcomeIdentity, commandStreamStart } from '../packages/simulation-runtime/src/evidence-identity.mjs';
import { runPolicyMatch } from '../packages/simulation-runtime/src/runtime.mjs';
import * as evolutionDomain from '../packages/simulation-runtime/src/evolution-domain.mjs';
import { observatorySummariesForRun } from '../packages/simulation-runtime/src/observatory-bridge.mjs';
import { createEvidenceSnapshot } from '../packages/simulation-runtime/src/discovery-domain.mjs';
import { scanEvidence } from '../packages/simulation-runtime/src/discovery-scan.mjs';
import { admitMeasurement, startSeries, trainingManifest } from '../packages/simulation-runtime/src/profile-science.mjs';
import { makeArtifact } from '../packages/simulation-runtime/src/profile-contracts.mjs';
import { memoryStore, createGraveMaw, fixtureMeasurement } from './fixtures/agent-profile-fixtures.mjs';

const summary=(ordinal=0,extra={},config={})=>trustedSummary({matchOrdinal:ordinal,matchId:`old-${ordinal}`,policyIds:['control','tempo'],winner:'P1',winningSeat:1,terminationReason:'NORMAL_VICTORY',...extra},config);
const entry=(id,summaries)=>({id,summaries});
const envelope=rows=>{
  const payload={summaries:rows,aggregate:null};
  const run=createRunRecord({experimentId:'EXP-LAB',ordinal:1,config:{matchCount:rows.length},metrics:{matchCount:rows.length,completedMatchCount:rows.filter(r=>r.terminationReason==='NORMAL_VICTORY').length},payloadHash:payloadEvidenceHash(payload)});
  return experimentRunArtifact({run,evidence:{kind:'summaries',...payload}});
};

test('R06: valid current rows are admitted for analysis with exact coverage and no promotion authority',()=>{
  const a=admitSummaries([summary(0),summary(1)]);
  assert.equal(a.eligible,true);assert.equal(a.classification,'VERIFIED');assert.equal(a.uniqueSampleCount,2);assert.deepEqual(a.ordinals,[0,1]);assert.equal(a.automaticPromotion,false);
});
test('R06: valid legacy archives remain inspectable and exportable but cannot enter scientific selection',()=>{
  const row={matchOrdinal:0,seed:42,terminationReason:'NORMAL_VICTORY',winningSeat:1};
  const decoded=validateExperimentRunArtifact(envelope([row]));
  assert.equal(decoded.admission.classification,'RESTRICTED_LEGACY');assert.equal(decoded.admission.eligible,false);
  assert.deepEqual(selectEvidence([entry('legacy',[row])]).summaries,[]);
  assert.equal(experimentRunArtifact({run:decoded.run,evidence:{kind:'summaries',...decoded.payload}}).payload.run.runHash,decoded.run.runHash);
});
test('R06: unknown summary and identity schemas are inspection-only, including otherwise valid bytes',()=>{
  for(const row of [summary(0,{schemaVersion:'999.0'}),{...summary(),identity:{...summary().identity,schemaVersion:'999.0'}}]){
    const decoded=validateExperimentRunArtifact(envelope([row]));assert.equal(decoded.admission.eligible,false);
    assert.equal(selectEvidence([entry('unsupported',[row])]).selection.effectiveSampleCount,0);
  }
});
test('R06: raw-summary duplicates and contradictory aggregate counts are rejected after all hashes verify',()=>{
  assert.throws(()=>validateExperimentRunArtifact(envelope([summary(),summary()])),{code:'RUN_ARTIFACT_DUPLICATE_ORDINAL'});
  const artifact=envelope([summary()]);artifact.payload.evidence.aggregate={matchCount:999};
  artifact.payload.run=createRunRecord({experimentId:'EXP-LAB',ordinal:1,config:{matchCount:1},metrics:{matchCount:1},payloadHash:payloadEvidenceHash({summaries:artifact.payload.evidence.summaries,aggregate:{matchCount:999}})});
  artifact.contentHash=hashCanonical(artifact.payload);assert.throws(()=>validateExperimentRunArtifact(artifact),{code:'RUN_COUNTS_MISMATCH'});
});
test('R06: sample inputs and retained outcome cannot be edited behind valid outer checksums',()=>{
  const row=summary();row.identity.sampleInputs.seed+=1;
  assert.throws(()=>admitSummaries([row]),{code:'EVIDENCE_SAMPLE_IDENTITY_MISMATCH'});
  const outcome=summary();outcome.finalStateHash='edited';
  assert.throws(()=>admitSummaries([outcome]),{code:'EVIDENCE_OUTCOME_MISMATCH'});
});
test('R06: mixed decision coverage never claims full fidelity',()=>{
  const rows=[summary(0,{strategicTelemetry:{turns:1}}),summary(1)];
  const a=admitSummaries(rows);assert.equal(a.fidelity,'MIXED');assert.deepEqual(a.decisionCoverage,{covered:1,total:2});
  assert.equal(runDecisionFidelity(null,{sampleSummaries:rows}),'MIXED');
});
test('R06: ordinal-only evidence is not reproducible; complete retained inputs require available matching code',()=>{
  assert.equal(replayCoverageForSummaries([{matchOrdinal:5}]).gamesReproducible,0);
  const row=summary(),run={config:{policyIds:row.policyIds}};
  assert.equal(replayCoverageForSummaries([row],{run,implementation:currentIdentity}).gamesReproducible,1);
  assert.equal(replayCoverageForSummaries([row],{run,implementation:{...currentIdentity,fingerprint:'foreign'}}).gamesReproducible,0);
});
test('R07: deterministic repeats count once and changed outcomes fail rather than last-row wins',()=>{
  const a=summary(),b=summary(3,{seed:a.seed,finalStateHash:a.finalStateHash});
  const selected=selectEvidence([entry('first',[a]),entry('repeat',[b])]);
  assert.equal(selected.summaries.length,1);assert.equal(selected.selection.repeatCount,1);
  b.finalStateHash='other';b.identity={...b.identity,...outcomeIdentity(b,commandStreamStart())};
  assert.throws(()=>selectEvidence([entry('first',[a]),entry('conflict',[b])]),{code:'EVIDENCE_SAMPLE_CONFLICT'});
});
test('R07: two actual weighted genomes sharing the old match ID survive selection as distinct subjects',()=>{
  const first=baselinePolicyState(),second=structuredClone(first);second.weights.points=-2000;second.weights.defense=2000;
  const rows=[first,second].map(policyState=>runPolicyMatch({seed:42,profileId:'core-advanced-authority',policyIds:[WEIGHTED_POLICY_ID,'control'],policyStates:[policyState,null],telemetryEnabled:false,includeReplay:false}).summary);
  rows[1].matchId=rows[0].matchId; // Reproduce the historical display-ID collision with real outcomes.
  const selected=selectEvidence(rows.map((row,i)=>entry(`genome-${i}`,[row]))),analytical=analyticsSummaries(selected.summaries);
  assert.equal(selected.summaries.length,2);assert.notEqual(analytical[0].policyIds[0],analytical[1].policyIds[0]);
  assert.notEqual(analytical[0].matchId,analytical[1].matchId);assert.equal(analytical[0].sourceMatchId,rows[0].matchId);
  assert.deepEqual(analyticsSummaries(analytical),analytical,'projection is idempotent for derived-view consumers');
});
test('R07: rules and implementation cohorts require explicit choice; selected view discloses all strata',()=>{
  const a=summary(),b=summary(1);const foreign={...currentIdentity,fingerprint:'f'.repeat(64),analysisFingerprint:'a'.repeat(64)};
  b.identity={...sampleIdentity({seed:b.seed,profileId:b.profileId,policyIds:b.policyIds},foreign),...outcomeIdentity(b,commandStreamStart())};
  assert.throws(()=>selectEvidence([entry('current',[a]),entry('foreign',[b])]),{code:'EVIDENCE_COHORT_SELECTION_REQUIRED'});
  const cohort=admitSummaries([a]).cohorts[0],selected=selectEvidence([entry('current',[a]),entry('foreign',[b])],{cohort});
  assert.equal(selected.summaries.length,1);assert.equal(selected.selection.cohorts.length,2);
});
test('R07: middle-row telemetry edits change the selection digest without changing endpoint IDs or counts',()=>{
  const rows=[summary(0),summary(1),summary(2)];const old=selectEvidence([entry('run',rows)]).selection.digest;
  rows[1].mechanicCounts={voltage:7};assert.notEqual(selectEvidence([entry('run',rows)]).selection.digest,old);
});
test('R07: failed derivation retains the entire prior snapshot and records staleness separately',()=>{
  const state={},selected=selectEvidence([entry('run',[summary()])]);
  publishEvidenceSnapshot(state,{aggregate:{matchCount:1},observatory:{summaries:selected.summaries,rankPower:{old:true}},basis:{includedRunIds:['run']},selection:selected.selection,origin:'TEST'});
  const before={aggregate:state.aggregate,observatory:state.observatory,basis:state.evidenceBasis,snapshot:state.evidenceSnapshot,rank:state.rankPower};
  markEvidenceSnapshotStale(state,new Error('INJECTED_AGGREGATE_FAILURE'));
  assert.equal(state.aggregate,before.aggregate);assert.equal(state.observatory,before.observatory);assert.equal(state.evidenceBasis,before.basis);assert.equal(state.evidenceSnapshot,before.snapshot);assert.equal(state.rankPower,before.rank);assert.equal(state.evidenceViewStatus.stale,true);
});
test('R07: Evolution projection preserves original sample, outcome, subjects and checkpoints',()=>{
  const s=summary(),record={ordinal:0,seed:s.seed,matchId:s.matchId,policyIds:s.policyIds,winner:s.winner,winningSeat:1,terminationReason:s.terminationReason,scoreP1:0,scoreP2:0,finalStateHash:s.finalStateHash,evidenceIdentity:s.identity,checkpointIds:['a','b']};
  const projected=observatorySummaryForRecord(record,{runId:'EL-test',config:{profileId:s.profileId}});
  assert.deepEqual(projected.identity,s.identity);assert.deepEqual(projected.checkpointIds,['a','b']);assert.equal(admitSummaries([projected]).eligible,true);
});
test('R07: Meta Atlas cache uses the full evidence digest rather than endpoints',async()=>{
  const source=await readFile(new URL('../apps/lab-web/src/workspaces/meta-atlas.js',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('function atlasModel()'),source.indexOf('// ── controls'));
  let builds=0;const rows=[summary(0),summary(1),summary(2)],state={observatory:{summaries:rows}};
  const {atlasModel}=runInNewContext('let _cache={sig:null};'+fn+';({atlasModel})',{state,prefs:()=>({x:'x',y:'y',minGames:1,cohort:'all'}),evidenceDigest:hashCanonical,buildAtlasModel:()=>({build:++builds}),analyticsSummaries});
  assert.equal(atlasModel().build,1);assert.equal(atlasModel().build,1);rows[1].mechanicCounts={tempo:5};assert.equal(atlasModel().build,2);
});

test('R06: every weighted seat needs its original executable state for reproducibility',()=>{
  const states=[baselinePolicyState(),baselinePolicyState()],policyIds=[WEIGHTED_POLICY_ID,WEIGHTED_POLICY_ID];
  const row=summary(0,{policyIds},{policyIds,policyStates:states});
  const coverage=policyStates=>replayCoverageForSummaries([row],{run:{config:{policyIds,policyStates}},implementation:currentIdentity}).gamesReproducible;
  assert.equal(coverage(null),0);assert.equal(coverage([states[0],null]),0);assert.equal(coverage(states),1);
  const wrong=structuredClone(states);wrong[1].weights.points+=1;assert.equal(coverage(wrong),0);
});

test('R06: Profile admission reconciles retained paired blocks, counts and objective after resealing',async()=>{
  const store=memoryStore(),created=await createGraveMaw(store,'wave3-profile-admission');
  const series=await startSeries({store,agentProfileId:created.agentProfileId,commandId:'wave3-series',overrides:{trainingPairs:2,candidates:1,generations:1}});
  const pack=await store.getArtifact(series.body.trainingPackId),era=await store.getArtifact(series.body.eraId);
  const manifest=trainingManifest({series,pack,era,subjectCheckpointId:series.body.sourceCheckpointId});
  const measurement=fixtureMeasurement({manifest,pack,era,score:()=>0});
  const admit=m=>admitMeasurement(m,manifest,{purpose:'TRAINING',subjectCheckpointId:manifest.body.subjectCheckpointId});
  assert.equal(admit(measurement).id,measurement.id);
  for(const [mutate,code] of [
    [b=>{b.matchups[0].metrics.clean+=1;},'EVIDENCE_MEASUREMENT_COUNTS_MISMATCH'],
    [b=>{b.matchups[0].metrics.pairedScore=null;},'EVIDENCE_MEASUREMENT_COUNTS_MISMATCH'],
    [b=>{b.matchups[0].blocks[1].seed=b.matchups[0].blocks[0].seed;},'EVIDENCE_SEED_DUPLICATE'],
    [b=>{b.aggregate.objectiveScore=1;},'EVIDENCE_OBJECTIVE_MISMATCH'],
  ]){
    const body=structuredClone(measurement.body);mutate(body);
    assert.throws(()=>admit(makeArtifact('MEASUREMENT_RESULT',body,{scope:measurement.scope})),{code});
  }
});

const labRun=row=>({runId:'EL-wave3',identity:currentIdentity,config:{botA:row.policyIds[0],botB:row.policyIds[1],profileId:row.profileId},records:[{
  ordinal:row.matchOrdinal,seed:row.seed,policyIds:row.policyIds,winner:row.winner,winningSeat:row.winningSeat,terminationReason:row.terminationReason,
  scoreP1:row.finalScores.P1,scoreP2:row.finalScores.P2,finalStateHash:row.finalStateHash,evidenceIdentity:row.identity,
}]});

test('R07: Discover freezes the exact accepted evidence and rejects changed source rows',()=>{
  const run=labRun(summary()),snapshot=createEvidenceSnapshot([run],currentIdentity);
  assert.equal(snapshot.gameCount,1);assert.equal(scanEvidence([run],snapshot).rowCount,1);
  run.records[0].mechanicCounts={edited:2};
  assert.throws(()=>scanEvidence([run],snapshot),/EVIDENCE_SNAPSHOT_CHANGED/);
});

test('R07: Discover rejects subjects it cannot execute and historical analysis identities',()=>{
  const weighted=labRun(summary(0,{policyIds:[WEIGHTED_POLICY_ID,'control']},{policyStates:[baselinePolicyState(),null]}));
  const unavailable=createEvidenceSnapshot([weighted],currentIdentity);
  assert.equal(unavailable.gameCount,0);assert.equal(unavailable.exclusionReasons.EVIDENCE_SUBJECT_NOT_EXECUTABLE,1);
  const historical=labRun(summary());historical.identity={...currentIdentity,analysisFingerprint:'old-analysis'};
  assert.equal(createEvidenceSnapshot([historical],currentIdentity).exclusionReasons.FOREIGN_FINGERPRINT,1);
  const contradictory=labRun(summary());contradictory.metrics={games:999,clean:999,aborted:0,draws:0};
  assert.equal(createEvidenceSnapshot([contradictory],currentIdentity).exclusionReasons.EVIDENCE_RESTRICTED,1);
});

test('R06: Evolution inspection labels analysis-version drift historical without changing the original envelope',async()=>{
  const source=(await readFile(new URL('../apps/lab-web/src/evolution/evolution-store.mjs',import.meta.url),'utf8')).replace(/import\s[^;]*?from\s*'[^']*';/gs,'').replace(/^export /gm,'');
  const Store=runInNewContext(source+';EvolutionStore',{...evolutionDomain,hashCanonical,admitSummaries,observatorySummariesForRun});
  const identity=structuredClone(currentIdentity);identity.dependencyManifest.analysis.push(['historic-protocol','a'.repeat(64)]);
  identity.analysisHash=hashCanonical(identity.dependencyManifest.analysis);identity.analysisFingerprint=hashCanonical({fingerprint:identity.fingerprint,analysisHash:identity.analysisHash});
  const run=evolutionDomain.createLabRun({botA:'control',botB:'tempo',gameCount:2,seed:42},identity);
  const envelope=evolutionDomain.artifactEnvelope(run),before=JSON.stringify(envelope),store=new Store(currentIdentity);
  store.read=async()=>envelope;
  const inspected=await store.loadForInspection(run.runId);
  assert.equal(inspected.historical,true);assert.equal(inspected.admission.eligible,false);assert.equal(JSON.stringify(envelope),before);
});
