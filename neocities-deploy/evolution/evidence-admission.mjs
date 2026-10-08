import { hashCanonical } from '../shared-browser.js';
import { createManifestHeadline, foldSummariesIntoHeadline } from './experiment-domain.mjs';

const fault = code => { throw Object.assign(new Error(code), { code }); };
const digest = value => typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
const freeze = value => {if(value && typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const supported = value => value == null || ['4.1.0', '1.0.0', 1].includes(value);
export const evidenceDigest = value => hashCanonical(value);
export const hasDecisionEvidence = s => !!(s?.strategicTelemetry || s?.strategyDecisions?.length || s?.decisions?.some(d => d?.candidateScores?.length));

export function validateEvidenceBatch(batch, descriptor, runId) {
  if(!Number.isInteger(descriptor.batchIndex) || !Array.isArray(batch.summaries) || descriptor.matchCount!==batch.summaries.length ||
      !Number.isInteger(descriptor.ordinalStart) || !Number.isInteger(descriptor.ordinalEnd) || descriptor.ordinalEnd-descriptor.ordinalStart!==batch.summaries.length ||
      batch.summaries.some(s=>!Number.isInteger(s.matchOrdinal) || s.matchOrdinal<descriptor.ordinalStart || s.matchOrdinal>=descriptor.ordinalEnd))fault('RUN_DESCRIPTOR_MISMATCH');
  if(hashCanonical(batch.summaries)!==descriptor.summariesHash)fault('RUN_PAYLOAD_HASH_MISMATCH');
  if(descriptor.receiptHash && batch.receipt?.receiptHash!==descriptor.receiptHash)fault('RUN_BATCH_RECEIPT_MISMATCH');
  if(batch.receipt){
    const {receiptHash,...body}=batch.receipt;
    if(body.contract!=='intrilex-batch-receipt@1' || hashCanonical(body)!==receiptHash || body.runId!==runId ||
      body.batchId!==`${runId}#${descriptor.batchIndex}` || body.payloadDigest!==descriptor.summariesHash ||
      hashCanonical(body.ordinals)!==hashCanonical(batch.summaries.map(s=>s.matchOrdinal).sort((a,b)=>a-b)))fault('RUN_BATCH_RECEIPT_MISMATCH');
  }
}

/** Profile measurements retain paired sufficient statistics, not raw summaries. */
export function admitPairedEvidence(measurement, manifest) {
  const body=measurement.body, opponents=new Set();
  let games=0, pairs=0;
  if(!Array.isArray(body.matchups))fault('EVIDENCE_MEASUREMENT_INVALID');
  if(body.status==='COMPLETE' && body.matchups.length!==manifest.body.opponents.length)fault('EVIDENCE_MEASUREMENT_INCOMPLETE');
  for(const matchup of body.matchups){
    if(opponents.has(matchup.opponentCheckpointId))fault('EVIDENCE_OPPONENT_DUPLICATE');opponents.add(matchup.opponentCheckpointId);
    if(!Array.isArray(matchup.blocks))fault('EVIDENCE_BLOCKS_INVALID');
    const seeds=new Set();let clean=0,complete=0,score=0;
    for(const block of matchup.blocks){
      if(!Number.isInteger(block.seed) || seeds.has(block.seed))fault('EVIDENCE_SEED_DUPLICATE');seeds.add(block.seed);
      for(const leg of [block.ab,block.ba]){if(leg!==null && ![0,.5,1].includes(leg))fault('EVIDENCE_BLOCK_SCORE_INVALID');if(leg!==null)clean++;}
      if(block.ab!==null && block.ba!==null){complete++;score+=(block.ab+block.ba)/2;}
    }
    if(matchup.status==='COMPLETE' && (matchup.metrics.games!==matchup.plannedGames || matchup.blocks.length*2!==matchup.plannedGames))fault('INCOMPLETE_BLOCKS');
    if(matchup.metrics.clean!==clean || matchup.metrics.pairCount!==complete ||
      matchup.metrics.games!==clean+matchup.metrics.aborted ||
      (complete ? Math.abs(matchup.metrics.pairedScore-score/complete)>1e-12 : matchup.metrics.pairedScore!==null))fault('EVIDENCE_MEASUREMENT_COUNTS_MISMATCH');
    games+=matchup.metrics.games;pairs+=complete;
  }
  return {contract:'intrilex-admission@1',classification:'VERIFIED',purpose:body.purpose,games,independentPairCount:pairs,
    evidenceDigest:hashCanonical({measurement:measurement.digest,manifest:manifest.digest}),automaticPromotion:false};
}

/** Validate retained identity without filling missing historical provenance. */
export function sampleAdmission(row) {
  const id = row?.identity ?? row?.evidenceIdentity;
  const reasons = [];
  if (!supported(row?.schemaVersion)) reasons.push('EVIDENCE_SCHEMA_UNSUPPORTED');
  if (id?.schemaVersion !== '2.0.0') reasons.push(id ? 'EVIDENCE_IDENTITY_UNSUPPORTED' : 'EVIDENCE_SUBJECT_UNKNOWN');
  const inputs = id?.sampleInputs;
  if (!inputs || id?.subjectDigests?.length!==2 || !id.subjectDigests.every(s=>typeof s==='string' && /^SUB2-[a-f0-9]{64}$/.test(s)) ||
      !digest(id?.outcomeDigest) || !digest(id?.commandDigest) || !digest(id?.executionFingerprint) || !digest(id?.analysisFingerprint)) reasons.push('EVIDENCE_PROVENANCE_INCOMPLETE');
  if (!reasons.length) {
    if (inputs.contract !== 'intrilex-sample@3' || id.deterministicSampleId !== `M3-${hashCanonical(inputs)}` ||
        hashCanonical(inputs.subjectDigests) !== hashCanonical(id.subjectDigests) || inputs.executionFingerprint !== id.executionFingerprint ||
        (row.seed != null && inputs.seed !== row.seed) || (row.profileId != null && inputs.profileId !== row.profileId)) fault('EVIDENCE_SAMPLE_IDENTITY_MISMATCH');
    if (id.outcomeContract !== 'intrilex-outcome@1') fault('EVIDENCE_OUTCOME_CONTRACT_UNSUPPORTED');
    // Projected Evolution rows retain their original outcome fields verbatim.
    const outcome = { contract: id.outcomeContract, commandDigest: id.commandDigest, profileId: row.profileId,
      terminationReason: row.terminationReason, winner: row.winner, finalStateHash: row.finalStateHash, finalScores: row.finalScores };
    if (hashCanonical(outcome) !== id.outcomeDigest) fault('EVIDENCE_OUTCOME_MISMATCH');
  }
  return { eligible: !reasons.length, reasons, sampleId: id?.deterministicSampleId ?? null,
    outcomeDigest: id?.outcomeDigest ?? null, subjectDigests: id?.subjectDigests ?? null,
    cohort: !reasons.length ? hashCanonical({ rules: inputs.rulesVersion, profile: inputs.profileId,
      overrides: inputs.ruleOverrides, execution: id.executionFingerprint, analysis: id.analysisFingerprint,
      stream: inputs.seedStreamVersion, catalog: inputs.seedCatalogVersion }) : null };
}

/** Streaming semantic reconciliation; retains indexes, never full payload rows. */
export function createEvidenceAdmission({ run = null, expectedCount = null, aggregate = null } = {}) {
  const ordinals = new Set(), samples = new Map(), reasons = new Set(), rowDigests = [], cohorts = new Set();
  const headline = createManifestHeadline();
  let decisions = 0, repeats = 0;
  if (run?.schemaVersion != null && !supported(run.schemaVersion)) reasons.add('EVIDENCE_SCHEMA_UNSUPPORTED');
  return {
    add(rows) {
      if (!Array.isArray(rows)) fault('RUN_ARTIFACT_EVIDENCE_INVALID');
      for (const row of rows) {
        if (!row || typeof row !== 'object') fault('EVIDENCE_ROW_INVALID');
        const ordinal = row.matchOrdinal ?? row.ordinal;
        if (ordinal != null) {
          if (!Number.isInteger(ordinal) || ordinal < 0) fault('RUN_ARTIFACT_ORDINAL_INVALID');
          if (ordinals.has(ordinal)) fault('RUN_ARTIFACT_DUPLICATE_ORDINAL');
          ordinals.add(ordinal);
        } else reasons.add('EVIDENCE_COVERAGE_UNKNOWN');
        const admission = sampleAdmission(row);
        for (const reason of admission.reasons) reasons.add(reason);
        if (admission.eligible) {
          const previous = samples.get(admission.sampleId);
          if (previous && previous !== admission.outcomeDigest) fault('EVIDENCE_SAMPLE_CONFLICT');
          if (previous) repeats += 1;
          samples.set(admission.sampleId, admission.outcomeDigest); cohorts.add(admission.cohort);
          const impl = run?.config?.implementation ?? run?.identity;
          const identity = row.identity ?? row.evidenceIdentity;
          if (impl && (impl.fingerprint !== identity.executionFingerprint || impl.analysisFingerprint !== identity.analysisFingerprint)) fault('EVIDENCE_IMPLEMENTATION_MISMATCH');
        }
        rowDigests.push(hashCanonical(row));
        if (hasDecisionEvidence(row)) decisions += 1;
        foldSummariesIntoHeadline(headline, [row]);
      }
    },
    finish() {
      const count = expectedCount ?? run?.metrics?.matchCount;
      if (count != null && count !== headline.matchCount) fault('RUN_COUNTS_MISMATCH');
      if (run?.config?.matchCount != null && run.config.matchCount !== headline.matchCount) fault('RUN_COUNTS_MISMATCH');
      if(Array.isArray(run?.config?.ordinalCoverage)) {
        const covered=new Set();
        for(const r of run.config.ordinalCoverage){
          if(!Number.isInteger(r.start) || !Number.isInteger(r.end) || r.end<=r.start)fault('RUN_COVERAGE_MISMATCH');
          for(let o=r.start;o<r.end;o++){if(covered.has(o))fault('RUN_COVERAGE_MISMATCH');covered.add(o);}
        }
        if(covered.size!==ordinals.size || [...ordinals].some(o=>!covered.has(o)))fault('RUN_COVERAGE_MISMATCH');
      }
      for (const claim of [run?.metrics, aggregate]) {
        if (!claim) continue;
        for (const [key, value] of Object.entries({ matchCount: headline.matchCount, completedMatchCount: headline.completedMatchCount,
          abortCount: headline.abortCount, drawCount: headline.drawCount, seat1Wins: headline.seatWins['1'], seat2Wins: headline.seatWins['2'] })) {
          if (claim[key] != null && claim[key] !== value) fault('RUN_COUNTS_MISMATCH');
        }
        if (claim.seatWins && hashCanonical(claim.seatWins) !== hashCanonical(headline.seatWins)) fault('RUN_COUNTS_MISMATCH');
      }
      if (!headline.matchCount) reasons.add('RUN_NO_RETAINED_EVIDENCE');
      if (cohorts.size > 1) reasons.add('EVIDENCE_COHORT_MIXED');
      const list = [...reasons].sort();
      return { contract: 'intrilex-admission@1', classification: list.length ? 'RESTRICTED_LEGACY' : 'VERIFIED',
        eligible: !list.length, reasons: list, summaryCount: headline.matchCount, uniqueSampleCount: samples.size, repeatCount: repeats,
        ordinals: [...ordinals].sort((a,b) => a-b), cohorts: [...cohorts].sort(), headline,
        decisionCoverage: { covered: decisions, total: headline.matchCount },
        fidelity: !headline.matchCount ? 'NONE' : decisions === headline.matchCount ? 'FULL_DECISION_EVIDENCE' : decisions ? 'MIXED' : 'SUMMARY_ONLY',
        evidenceDigest: hashCanonical({ runHash: run?.runHash ?? null, rows: rowDigests, reasons: list }),
        purposes:{inspection:true,analysis:!list.length,automaticPromotion:false},automaticPromotion: false };
    },
  };
}

export function admitSummaries(rows, options = {}) {
  const admission = createEvidenceAdmission(options); admission.add(rows); return admission.finish();
}

/** Analytics keys executable subjects; retained policy names remain available. */
export function analyticsSummaries(rows) {
  return rows.map(row => {
    const digests = row.identity?.subjectDigests;
    if (!digests?.length) fault('EVIDENCE_SUBJECT_UNKNOWN');
    const subjectIds=digests.map((digest,i)=>`${row.policyIds[i]}::${digest}`);
    return { ...row, sourcePolicyIds: row.policyIds, policyIds: [...subjectIds],
      participants: row.participants?.map((p,i) => ({...p,sourcePolicyId:p.policyId,policyId:subjectIds[(p.seat ?? i+1)-1]})) };
  });
}

/** Exact scientific cohort; repeats contribute once and conflicts fail closed. */
export function selectEvidence(entries, { cohort = null } = {}) {
  const groups = new Map(), rejected = [], samples = new Map(), rows = [], sources = [];
  const outcomes=new Map();
  for (const entry of entries) {
    const admission = entry.admission ?? admitSummaries(entry.summaries);
    sources.push({ id: entry.id, digest: admission.evidenceDigest, receiptDigest: entry.receiptDigest ?? null, classification: admission.classification });
    if (!admission.eligible) { rejected.push({ id: entry.id, reasons: admission.reasons }); continue; }
    for (const row of entry.summaries) {
      const a = sampleAdmission(row);
      if(outcomes.has(a.sampleId) && outcomes.get(a.sampleId)!==a.outcomeDigest)fault('EVIDENCE_SAMPLE_CONFLICT');
      outcomes.set(a.sampleId,a.outcomeDigest);
      if (!groups.has(a.cohort)) groups.set(a.cohort, []);
      groups.get(a.cohort).push({ row, source: entry.id, admission: a });
    }
  }
  const cohorts = [...groups.keys()].sort();
  // Multiple cohorts require an explicit choice; never pick the largest/best.
  if (!cohort && cohorts.length > 1) throw Object.assign(new Error('EVIDENCE_COHORT_SELECTION_REQUIRED'), {code:'EVIDENCE_COHORT_SELECTION_REQUIRED',cohorts});
  const selected = cohort ?? cohorts[0] ?? null;
  if (cohort && !groups.has(cohort)) fault('EVIDENCE_COHORT_NOT_FOUND');
  let repeatCount = 0;
  for (const item of groups.get(selected) ?? []) {
    const a = item.admission, previous = samples.get(a.sampleId);
    if (previous && previous !== a.outcomeDigest) fault('EVIDENCE_SAMPLE_CONFLICT');
    if (previous) { repeatCount += 1; continue; }
    samples.set(a.sampleId, a.outcomeDigest); rows.push(item.row);
  }
  const selection = { contract: 'intrilex-evidence-selection@1', cohort: selected, cohorts, sources: sources.sort((a,b) => String(a.id).localeCompare(String(b.id))),
    rejected, sampleIds: [...samples.keys()].sort(), repeatCount, retainedSampleCount:rows.length,
    effectiveSampleCount:rows.filter(r=>['NORMAL_VICTORY','EXHAUSTED_RESOLUTION','CANONICAL_DRAW'].includes(r.terminationReason)).length };
  return { summaries: rows, selection: freeze({ ...selection, digest: hashCanonical(selection) }) };
}

/** One synchronous publication after all derivation succeeds. */
export function publishEvidenceSnapshot(state, { aggregate, observatory, basis, selection, origin }) {
  const snapshot = Object.freeze({ contract: 'intrilex-evidence-snapshot@1', digest: selection.digest, selection: freeze(structuredClone(selection)),
    aggregate, observatory: { ...observatory, evidenceSelectionDigest: selection.digest, datasetOrigin: origin }, basis: { ...basis, selectionDigest: selection.digest, stale: false } });
  Object.assign(state, { aggregate: snapshot.aggregate, observatory: snapshot.observatory, evidenceBasis: snapshot.basis,
    rankPower: observatory.rankPower ?? null, swapMatrix: observatory.swapMatrix ?? null, variantAnalytics: observatory.variantAnalytics ?? null,
    evidenceSnapshot: snapshot, evidenceViewStatus: { stale: false, error: null } });
  return snapshot;
}

export function markEvidenceSnapshotStale(state, error) {
  state.evidenceViewStatus = { stale: true, error: String(error?.code ?? error?.message ?? error) };
}
