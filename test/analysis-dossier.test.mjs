import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hashCanonical, canonicalize } from '../packages/shared/src/canonical.mjs';
import { buildAnalysisDossier, serializeAnalysisDossier, renderAnalysisDossierMarkdown, analysisDossierFileNames, DOSSIER_FORMAT, DOSSIER_VERSION } from '../apps/lab-web/src/analysis-dossier.js';
import { extractAnalysis } from '../packages/analytics/src/extract.mjs';
import { runLabSeries, evolutionIdentity } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { artifactEnvelope } from '../packages/simulation-runtime/src/evolution-domain.mjs';

// ── Fixtures ─────────────────────────────────────────────────────────────
const observatory = JSON.parse(readFileSync(new URL('../sample-data/observatory/analytics.json', import.meta.url), 'utf8'));
const aggregate = JSON.parse(readFileSync(new URL('../sample-data/autonomy/aggregate.json', import.meta.url), 'utf8'));
const corpusAnalytics = JSON.parse(readFileSync(new URL('../sample-data/corpus-analytics.json', import.meta.url), 'utf8'));
const replayIndex = JSON.parse(readFileSync(new URL('../sample-data/replay-index.json', import.meta.url), 'utf8'));
const autonomyIndex = JSON.parse(readFileSync(new URL('../sample-data/autonomy/lab-replay-index.json', import.meta.url), 'utf8'));
const VERSIONS = { labVersion: '1.0.0', engineVersion: '4.2.6', rulesVersion: '4.3.1', officialRulesVersion: '4.3.1', observatorySchemaVersion: '4.1.0' };
const GENERATED = '2026-01-15T10:30:00.000Z';

const identity = await evolutionIdentity();
const labRun = (await runLabSeries({ botA: 'value', botB: 'tempo', gameCount: 4, seed: 1337, workerCount: 1, strategicTrace: true, kind: 'EVALUATION', mirrorSeats: true }, { identity, createdAt: '2026-10-04T16:00:00.000Z' })).run;
const labRunEnvelope = artifactEnvelope(labRun);

function labInput({ historical = false } = {}) {
  const run = historical ? { ...structuredClone(labRun), identity: { ...identity, fingerprint: 'f'.repeat(64) }, evidenceOrigin: 'IMPORTED_UNVERIFIED', archival: true } : labRun;
  return {
    available: true, identity,
    liveRun: run, liveStatus: run.status, liveAggregator: null, liveArchiveRef: null,
    analyticsFilters: { window: 100, from: 1, to: 10000 },
    liveMatrix: null,
    persistedRuns: [{ run, contentHash: labRunEnvelope.contentHash }],
    matrices: [], researchProjects: [],
    strategy: { sources: [], provenance: [], counts: { events: 0 } },
    collectionNotes: [],
  };
}
function dossierInput(overrides = {}) {
  return {
    observatory, aggregate, corpusAnalytics, replayIndex, autonomyIndex,
    versions: VERSIONS,
    analysisExtract: extractAnalysis({ analytics: observatory, aggregate }),
    lab: null,
    ...overrides,
  };
}

// ── Canonical construction ───────────────────────────────────────────────
test('dossier builds from representative Observatory state and serializes to valid JSON', () => {
  const d = buildAnalysisDossier(dossierInput(), { generatedAt: GENERATED });
  assert.equal(d.format, DOSSIER_FORMAT);
  assert.equal(d.schemaVersion, DOSSIER_VERSION);
  assert.equal(d.generatedAt, GENERATED);
  assert.match(d.dossierHash, /^[a-f0-9]{64}$/);
  const parsed = JSON.parse(serializeAnalysisDossier(d));
  assert.equal(parsed.format, DOSSIER_FORMAT);
  assert.equal(parsed.dossierHash, d.dossierHash);
});

test('dossierHash is deterministic and independent of generatedAt', () => {
  const a = buildAnalysisDossier(dossierInput(), { generatedAt: '2026-01-01T00:00:00.000Z' });
  const b = buildAnalysisDossier(dossierInput(), { generatedAt: '2026-12-31T23:59:59.000Z' });
  assert.equal(a.dossierHash, b.dossierHash);
  assert.notEqual(a.exportId, b.exportId);
});

test('dossierHash is independent of input object key order', () => {
  const reverseKeys = v => Array.isArray(v) ? v.map(reverseKeys)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().reverse().map(k => [k, reverseKeys(v[k])])) : v;
  const a = buildAnalysisDossier(dossierInput({ observatory: reverseKeys(observatory) }), { generatedAt: GENERATED });
  const b = buildAnalysisDossier(dossierInput(), { generatedAt: GENERATED });
  assert.equal(a.dossierHash, b.dossierHash);
});

test('canonical serialization is stable and hash verifies', () => {
  const d = buildAnalysisDossier(dossierInput(), { generatedAt: GENERATED });
  const json1 = serializeAnalysisDossier(d);
  const json2 = serializeAnalysisDossier(buildAnalysisDossier(dossierInput(), { generatedAt: '2020-01-01T00:00:00.000Z' }));
  // Only volatile fields differ.
  const strip = s => { const o = JSON.parse(s); delete o.generatedAt; delete o.exportId; delete o.dossierHash; return canonicalize(o); };
  assert.equal(strip(json1), strip(json2));
  const { generatedAt: _g, exportId: _e, dossierHash: _h, ...body } = d;
  assert.equal(hashCanonical(body), d.dossierHash);
});

test('file names are deterministic and descriptive', () => {
  const d = buildAnalysisDossier(dossierInput(), { generatedAt: GENERATED });
  const names = analysisDossierFileNames(d);
  assert.match(names.json, /^intrilex-analysis-dossier-\d{14}-[a-f0-9]{12}\.json$/);
  assert.match(names.markdown, /^intrilex-analysis-dossier-\d{14}-[a-f0-9]{12}\.md$/);
  assert.equal(analysisDossierFileNames(d).json, names.json);
});

// ── Markdown ─────────────────────────────────────────────────────────────
test('markdown is deterministic, references the same dossier hash, and covers critical sections', () => {
  const d = buildAnalysisDossier(dossierInput(), { generatedAt: GENERATED });
  const md1 = renderAnalysisDossierMarkdown(d);
  const md2 = renderAnalysisDossierMarkdown(buildAnalysisDossier(dossierInput(), { generatedAt: GENERATED }));
  assert.equal(md1, md2);
  for (const section of ['# Intrilex Analysis Dossier', '## Executive Summary', '## Build / Rules / Research Identity', '## Evidence Coverage', '## Integrity & Completeness', '## Policy / Profile Performance', '## Rank Analysis', '## Mechanics', '## Synergies', '## AB/BA & Seat Effects', '## Arena Results', '## Findings', '## Recommendations', '## Open Questions', '## Interpretation Boundaries', '## Provenance']) {
    assert.ok(md1.includes(section), `missing section: ${section}`);
  }
  assert.ok(md1.includes(d.dossierHash), 'markdown must reference the dossier hash');
});

test('markdown renderer rejects non-dossier input', () => {
  assert.throws(() => renderAnalysisDossierMarkdown({}), /NOT_AN_ANALYSIS_DOSSIER/);
  assert.throws(() => renderAnalysisDossierMarkdown(null), /NOT_AN_ANALYSIS_DOSSIER/);
});

// ── Missing-data / zero-vs-unavailable semantics ─────────────────────────
test('missing domains degrade to explicit unavailable declarations, never zeroes', () => {
  const d = buildAnalysisDossier({ versions: VERSIONS }, { generatedAt: GENERATED });
  assert.equal(d.observatory.available, false);
  assert.equal(d.arena.available, false);
  assert.equal(d.strategy.available, false);
  assert.equal(d.policies.available, false);
  assert.ok(d.unavailable.length >= 5);
  assert.ok(d.unavailable.every(u => typeof u.reason === 'string' && u.reason.length > 0));
  assert.doesNotThrow(() => JSON.parse(serializeAnalysisDossier(d)));
  const md = renderAnalysisDossierMarkdown(d);
  assert.ok(md.includes('Unavailable'));
});

test('measured zeroes are preserved as numbers, distinct from unavailable', () => {
  const d = buildAnalysisDossier(dossierInput({ lab: labInput() }), { generatedAt: GENERATED });
  assert.equal(typeof d.dataset.aggregate.abortCount, 'number');
  assert.strictEqual(d.dataset.aggregate.abortCount, aggregate.abortCount);
  // draws=0 stays 0 — it is measured, not "unavailable"
  assert.strictEqual(d.dataset.aggregate.drawCount, aggregate.drawCount);
  // no lab matrices → count is measured zero AND the section is empty
  assert.strictEqual(d.dataset.lab.matrixCount, 0);
});

test('dossier does not embed raw summaries or retained replay bodies', () => {
  const d = buildAnalysisDossier(dossierInput({ lab: labInput() }), { generatedAt: GENERATED });
  const json = serializeAnalysisDossier(d);
  assert.equal(d.observatory.summaries, undefined);
  for (const ref of d.dataset.retainedReplayRefs) {
    assert.deepEqual(Object.keys(ref).sort(), ['matchId', 'reasons']);
  }
  // No replay command payloads from lab runs leak into the dossier.
  for (const run of d.evolution.runs) for (const r of run.records) {
    assert.equal(r.seatBehavior, undefined);
    assert.equal(r.replay, undefined);
    assert.equal(r.strategyDecisions, undefined);
    assert.ok(r.telemetry, 'record row must carry telemetry-presence flags');
  }
  assert.ok(json.length < 20 * 1024 * 1024, 'dossier must stay bounded');
});

// ── Provenance ───────────────────────────────────────────────────────────
test('provenance propagates identity, hashes, epoch and artifact references', () => {
  const d = buildAnalysisDossier(dossierInput({ lab: labInput() }), { generatedAt: GENERATED });
  assert.equal(d.identity.engineVersion, '4.2.6');
  assert.equal(d.identity.rulesVersion, '4.3.1');
  assert.equal(d.identity.authorityHash, observatory.authorityHash);
  assert.equal(d.provenance.observatoryHash, observatory.observatoryHash);
  assert.equal(d.provenance.aggregateHash, observatory.aggregateHash);
  assert.equal(d.provenance.evidenceEpoch, observatory.evidenceEpoch);
  assert.equal(d.identity.labFingerprint, identity.fingerprint);
  const runArtifact = d.provenance.artifacts.runs.find(r => r.runId === labRun.runId);
  assert.equal(runArtifact.contentHash, labRunEnvelope.contentHash);
  assert.equal(runArtifact.historical, false);
});

// ── Evolution / Arena / Strategy inclusion ───────────────────────────────
test('lab run appears with compact record rows, metrics and telemetry coverage', () => {
  const d = buildAnalysisDossier(dossierInput({ lab: labInput() }), { generatedAt: GENERATED });
  const run = d.evolution.runs.find(r => r.runId === labRun.runId);
  assert.ok(run, 'run must be present');
  assert.equal(run.records.length, 4);
  assert.equal(run.metrics.clean, 4);
  assert.equal(run.observatoryCoverage.withRankDecisions, 4);
  assert.equal(run.replayRetention.retainedCount, labRun.replays.length);
  const row = run.records[0];
  for (const field of ['ordinal', 'seed', 'swapped', 'winner', 'terminationReason', 'scoreP1', 'scoreP2', 'resultHash']) assert.ok(field in row, `missing ${field}`);
});

test('arena analytics are included for the focus run', () => {
  const d = buildAnalysisDossier(dossierInput({ lab: labInput() }), { generatedAt: GENERATED });
  assert.equal(d.arena.available, true);
  assert.equal(d.arena.summary.accepted, 4);
  assert.equal(d.arena.pairs.n, 2);
  assert.ok(Array.isArray(d.arena.seats) && d.arena.seats.length === 2);
  assert.ok(d.arena.strategy?.A && d.arena.strategy?.B, 'strategic telemetry aggregates must be present');
  assert.ok(d.arena.diagnostics.every(x => x.terminalEvidence === null || x.terminalEvidence === 'RETAINED_IN_ARTIFACT'));
});

test('building the dossier does not mutate the run artifact', () => {
  const before = hashCanonical(artifactEnvelope(labRun).payload);
  buildAnalysisDossier(dossierInput({ lab: labInput() }), { generatedAt: GENERATED });
  assert.equal(hashCanonical(artifactEnvelope(labRun).payload), before);
});

test('historical-fingerprint runs are flagged and never merged as current evidence', () => {
  const d = buildAnalysisDossier(dossierInput({ lab: labInput({ historical: true }) }), { generatedAt: GENERATED });
  const run = d.evolution.runs.find(r => r.runId === labRun.runId);
  assert.equal(run.historical, true);
  assert.equal(run.evidenceOrigin, 'IMPORTED_UNVERIFIED');
  assert.equal(d.evolution.historicalArtifacts.length, 1);
  assert.equal(d.evolution.historicalArtifacts[0].runId, labRun.runId);
  assert.ok(d.openQuestions.some(q => /historical identity fingerprint/.test(q)));
});

test('unreadable run stubs degrade instead of crashing', () => {
  const lab = labInput();
  lab.persistedRuns.push({ run: { runId: 'EL-corrupt', status: 'UNREADABLE', records: null, checkpoints: null }, contentHash: null });
  lab.liveRun = null;
  const d = buildAnalysisDossier(dossierInput({ lab }), { generatedAt: GENERATED });
  const corrupt = d.evolution.runs.find(r => r.runId === 'EL-corrupt');
  assert.equal(corrupt.status, 'UNREADABLE');
  assert.equal(corrupt.records.length, 0);
  assert.equal(corrupt.metrics.clean, 0);
});

// ── Observatory domains ──────────────────────────────────────────────────
test('observatory domains are all present in the dossier', () => {
  const d = buildAnalysisDossier(dossierInput(), { generatedAt: GENERATED });
  assert.equal(d.policies.available, true);
  assert.equal(d.policies.items.length, observatory.policies.length);
  assert.equal(d.mechanics.items.length, observatory.mechanics.length);
  assert.equal(d.synergies.items.length, observatory.synergies.length);
  assert.equal(d.anomalies.items.length, observatory.anomalies.length);
  assert.equal(d.pairedAnalysis.pairCount, observatory.pairedABBA.pairCount);
  assert.equal(d.ranks.rankPower.ladder.length, observatory.rankPower.ladder.length);
  assert.equal(d.variants.available, true);
  assert.equal(d.choiceAnalysis.available, true);
  assert.equal(d.integrity.completeness.status, observatory.completeness.status);
  assert.ok(Object.keys(d.metricRegistry).length > 0);
  assert.ok(d.findings.length > 0);
  assert.ok(d.interpretationBoundaries.some(b => /not causal/i.test(b)));
});

// ── Normalized findings contract ─────────────────────────────────────────
test('findings use the normalized contract with verbatim statistics', () => {
  const d = buildAnalysisDossier(dossierInput(), { generatedAt: GENERATED });
  const mech = observatory.mechanics.find(m => m.evidenceGrade);
  const f = d.findings.find(x => x.findingId === `mechanic:${mech.metricId}`);
  assert.equal(f.evidenceGrade, mech.evidenceGrade);
  assert.equal(f.pValue, mech.pValue ?? null);
  assert.equal(f.qValue, mech.associationQValue ?? null);
  assert.ok(Array.isArray(d.findings));
  assert.ok(d.findings.every(x => typeof x.findingId === 'string' && typeof x.domain === 'string' && typeof x.interpretationBoundary === 'string'));
  // sorting: (domain, findingId)
  const keys = d.findings.map(x => `${x.domain}|${x.findingId}`);
  assert.deepEqual(keys, [...keys].sort());
});

// ── Batch matrix ─────────────────────────────────────────────────────────
test('persisted matrix manifests produce compact dossier rows', () => {
  const manifest = { format: 'intrilex-matchup-lab', schemaVersion: 2, kind: 'MANIFEST', payload: {
    matrixId: 'MX-test', status: 'COMPLETE', createdAt: '2026-10-01T00:00:00.000Z',
    config: { profileId: 'core-advanced-authority', gamesPerMatchup: 4 },
    participants: [{ participantId: 'static:value', displayName: 'value', kind: 'STATIC_POLICY', policyId: 'value' }, { participantId: 'static:tempo', displayName: 'tempo', kind: 'STATIC_POLICY', policyId: 'tempo' }],
    checkpoints: [], runRefs: [{ seatA: 'static:value', seatB: 'static:tempo', runId: labRun.runId, status: 'COMPLETE', records: 4 }],
  }, contentHash: 'x'.repeat(64) };
  const lab = labInput(); lab.matrices = [manifest]; lab.liveRun = null;
  const d = buildAnalysisDossier(dossierInput({ lab }), { generatedAt: GENERATED });
  assert.equal(d.batchExperiments.matrices.length, 1);
  const m = d.batchExperiments.matrices[0];
  assert.equal(m.matrixId, 'MX-test');
  assert.equal(m.cellsComplete, 1);
  assert.equal(m.cellsTotal, 1);
  assert.equal(m.runRefs[0].runId, labRun.runId);
  const md = renderAnalysisDossierMarkdown(d);
  assert.ok(md.includes('Matrix MX-test'));
});

// ── Legacy extract migration ─────────────────────────────────────────────
test('the dossier embeds the analysis extract and supersedes the old contract', () => {
  const extract = extractAnalysis({ analytics: observatory, aggregate });
  const d = buildAnalysisDossier(dossierInput({ analysisExtract: extract }), { generatedAt: GENERATED });
  assert.equal(d.analysisExtract.extractHash, extract.extractHash);
  assert.equal(d.provenance.extractHash, extract.extractHash);
  assert.ok(d.recommendations.length >= extract.recommendations.length);
  // The clipboard path emits serializeAnalysisDossier / renderAnalysisDossierMarkdown
  // output verbatim — assert both serializations are stable strings.
  assert.equal(typeof serializeAnalysisDossier(d), 'string');
  assert.equal(typeof renderAnalysisDossierMarkdown(d), 'string');
});

test('dossier without extract marks it unavailable explicitly', () => {
  const d = buildAnalysisDossier(dossierInput({ analysisExtract: null }), { generatedAt: GENERATED });
  assert.equal(d.analysisExtract, null);
  assert.ok(d.unavailable.some(u => u.domain === 'analysisExtract'));
});

// ── Rule Mutation experiments in the dossier ─────────────────────────────
test('persisted Rule Mutation experiments are first-class dossier evidence', async () => {
  const {
    createRuleMutation, createExperimentConfig, buildMutationExperimentPlan,
    createExperimentRecord, finalizeExperimentRecord,
  } = await import('@intrilex/simulation-runtime/mutation-domain');
  const stub = (spec) => ({
    winner: 'P1', winningSeat: 1, terminationReason: 'NORMAL_VICTORY', errorCode: null,
    completedFullTurns: 10, scoreMargin: 3, commandCount: 40, eventCount: 60,
    actionCounts: { play: 5 }, decisionFamilyCounts: { score: 4 },
    participants: [{ miniTurnActionCount: 6 }, { miniTurnActionCount: 5 }],
    policyIds: [spec.policyId, spec.policyId], pairedRunId: spec.pairedRunId,
    seed: spec.seed, seatOrder: spec.seatOrder, ruleCompliance: { status: 'PASS' },
    ruleOverrides: spec.ruleOverrides ?? null,
  });
  const mutation = createRuleMutation({ targetId: 'miniTurns.hardCap', mutatedValue: 2 });
  const config = createExperimentConfig({
    profileId: 'core-advanced-authority', population: ['tempo-tactical'], gamesPerArm: 2, seedBase: 7,
    objective: { metric: 'meanTurns', direction: 'decrease', minimumMeaningfulEffect: 0 },
  });
  const plan = buildMutationExperimentPlan({ experimentId: 'EXP-DOSSIER', mutation, config });
  const record = createExperimentRecord({
    experimentId: 'EXP-DOSSIER', createdAt: '2026-01-02T00:00:00.000Z',
    baseline: { engineVersion: '4.2.6', rulesVersion: '4.3.1', labVersion: '1.0.0', authorityHash: 'abc' },
    mutation, hypothesis: 'Faster tempo shortens games', config,
  });
  const final = finalizeExperimentRecord(record, {
    controlSummaries: plan.specs.filter(s => s.arm === 'control').map(stub),
    mutantSummaries: plan.specs.filter(s => s.arm === 'mutant').map(stub),
    plan, completedSpecCount: plan.specs.length, plannedSpecCount: plan.specs.length,
  });
  assert.equal(final.status, 'complete');

  const lab = labInput();
  lab.mutations = [{ record: final, contentHash: final.contentHash }];
  lab.liveRun = null;
  const d = buildAnalysisDossier(dossierInput({ lab }), { generatedAt: GENERATED });
  const mut = d.evolution.ruleMutations.find(m => m.experimentId === 'EXP-DOSSIER');
  assert.ok(mut, 'mutation experiment must appear in the dossier evolution section');
  assert.equal(mut.status, 'complete');
  assert.equal(mut.mutation.targetId, 'miniTurns.hardCap');
  assert.equal(mut.mutation.baselineValue, 3);
  assert.equal(mut.mutation.mutatedValue, 2);
  assert.deepEqual(mut.config.objective, { metric: 'meanTurns', direction: 'decrease', minimumMeaningfulEffect: 0 });
  assert.equal(mut.execution.ledgerExact, true);
  assert.equal(mut.execution.pairedExact, true);
  assert.equal(mut.arms.control.games, 2);
  assert.equal(mut.arms.control.seat1Wins, 2, 'sufficient statistics surface, not just rates');
  assert.ok(mut.impactRows.length > 0, 'impact rows copied from the artifact');
  assert.equal(mut.artifactContentHash, final.contentHash);
  assert.ok(d.dataset.lab.mutationExperimentCount >= 1);
  assert.ok(d.scope.labScope.mutationExperimentIds.includes('EXP-DOSSIER'));
  assert.ok(d.provenance.artifacts.mutations.some(m => m.experimentId === 'EXP-DOSSIER'));
  const md = renderAnalysisDossierMarkdown(d);
  assert.ok(md.includes('Rule Mutation Experiments'));
  assert.ok(md.includes('EXP-DOSSIER'));
});

test('corrupt/unreadable mutation envelopes are disclosed, never dropped silently', () => {
  const lab = labInput();
  lab.mutations = [{ record: { experimentType: 'rule-mutation', experimentId: 'EXP-BROKEN', status: 'UNREADABLE' }, contentHash: null, unreadable: true }];
  lab.collectionNotes.push('Persisted mutation experiment EXP-BROKEN unreadable/corrupt: MUTATION_HASH_MISMATCH');
  lab.liveRun = null;
  const d = buildAnalysisDossier(dossierInput({ lab }), { generatedAt: GENERATED });
  const mut = d.evolution.ruleMutations.find(m => m.experimentId === 'EXP-BROKEN');
  assert.ok(mut, 'corrupt envelope is disclosed as an entry, not dropped');
  assert.equal(mut.unavailable, true);
  assert.equal(d.dataset.lab.mutationExperimentUnreadable, 1);
  assert.ok(d.openQuestions.some(q => q.includes('EXP-BROKEN') && /unreadable|corrupt/.test(q)));
  const md = renderAnalysisDossierMarkdown(d);
  assert.ok(md.includes('EXP-BROKEN') && md.includes('UNREADABLE'));
});

test('incomplete and imported-unverified mutation experiments are flagged in open questions', async () => {
  const {
    createRuleMutation, createExperimentConfig, buildMutationExperimentPlan,
    createExperimentRecord, finalizeExperimentRecord,
  } = await import('@intrilex/simulation-runtime/mutation-domain');
  const mutation = createRuleMutation({ targetId: 'miniTurns.hardCap', mutatedValue: 2 });
  const config = createExperimentConfig({ profileId: 'core-advanced-authority', population: ['tempo-tactical'], gamesPerArm: 2, seedBase: 7 });
  const plan = buildMutationExperimentPlan({ experimentId: 'EXP-PART', mutation, config });
  const stub = (spec) => ({
    winner: 'P1', winningSeat: 1, terminationReason: 'NORMAL_VICTORY', errorCode: null,
    completedFullTurns: 10, scoreMargin: 3, commandCount: 40, eventCount: 60, actionCounts: {},
    decisionFamilyCounts: {}, participants: [], policyIds: [spec.policyId, spec.policyId],
    pairedRunId: spec.pairedRunId, seed: spec.seed, seatOrder: spec.seatOrder,
    ruleCompliance: { status: 'PASS' }, ruleOverrides: spec.ruleOverrides ?? null,
  });
  const record = createExperimentRecord({
    experimentId: 'EXP-PART', createdAt: '2026-01-02T00:00:00.000Z',
    baseline: { engineVersion: '4.2.6', rulesVersion: '4.3.1', labVersion: '1.0.0' },
    mutation, hypothesis: '', config,
  });
  const partial = finalizeExperimentRecord(record, {
    controlSummaries: plan.specs.filter(s => s.arm === 'control').map(stub),
    mutantSummaries: plan.specs.filter(s => s.arm === 'mutant').slice(1).map(stub),
    plan, completedSpecCount: 3, plannedSpecCount: 4,
  });
  assert.equal(partial.status, 'incomplete');
  const imported = { ...structuredClone(partial), experimentId: 'EXP-IMPORTED', evidenceOrigin: 'IMPORTED_UNVERIFIED' };
  const lab = labInput();
  lab.mutations = [{ record: partial, contentHash: null }, { record: imported, contentHash: null }];
  lab.liveRun = null;
  const d = buildAnalysisDossier(dossierInput({ lab }), { generatedAt: GENERATED });
  assert.ok(d.openQuestions.some(q => q.includes('EXP-PART') && /full declared plan/.test(q)));
  assert.ok(d.openQuestions.some(q => q.includes('EXP-IMPORTED') && /IMPORTED_UNVERIFIED/.test(q)));
});

test('a cancelled mutation experiment projects cancelled execution and stays flagged, never a finished verdict', () => {
  // The shape the workspace writes when a run is cancelled: status
  // incomplete, execution carries the cancelled flag, no ledger/arms —
  // the dossier must copy that truth, not synthesize a complete record.
  const lab = labInput();
  lab.mutations = [{ record: {
    experimentType: 'rule-mutation', experimentId: 'EXP-CANCELLED',
    status: 'incomplete', createdAt: '2026-01-03T00:00:00.000Z',
    baseline: { engineVersion: '4.2.6', rulesVersion: '4.3.1', labVersion: '1.0.0', authorityHash: 'abc' },
    mutation: { id: 'MUT-c', targetId: 'miniTurns.hardCap', label: 'mini-turn cap', baselineValue: 3, mutatedValue: 2, type: 'numeric' },
    hypothesis: 'h', config: { profileId: 'core-advanced-authority', population: ['tempo-tactical'], gamesPerArm: 4, matchedSeeds: true, swapSides: true, seedBase: 7, decisionLimit: 1800, objective: null },
    execution: { plannedSpecCount: 8, completedSpecCount: 0, cancelled: true, completedAt: '2026-01-03T00:00:10.000Z' },
  }, contentHash: null }];
  lab.liveRun = null;
  const d = buildAnalysisDossier(dossierInput({ lab }), { generatedAt: GENERATED });
  const mut = d.evolution.ruleMutations.find((m) => m.experimentId === 'EXP-CANCELLED');
  assert.ok(mut, 'the cancelled experiment must still surface in the dossier');
  assert.equal(mut.status, 'incomplete');
  assert.equal(mut.execution.cancelled, true, 'the cancelled flag is projected verbatim');
  assert.equal(mut.execution.completedSpecCount, 0);
  assert.ok(d.openQuestions.some((q) => q.includes('EXP-CANCELLED')), 'a cancelled plan remains an open question, not silent');
});

// ── Experiment scope (v1.1) ──────────────────────────────────────────────
// `experiments` is the collectExperimentEvidence() projection — the dossier
// must expose exactly which experiment runs produced (or failed to produce)
// the exported dataset.
import { deriveEvidenceStatus } from '../apps/lab-web/src/analysis-dossier.js';

function experimentInput(overrides = {}) {
  return {
    available: true,
    experimentId: 'EXP-LAB', analysisSetId: 'SET-LAB',
    includedRunIds: [], includedRunCount: 0, includedGames: 0,
    excludedRunCount: 0, excludedGames: 0, totalRuns: 0,
    invalidatedCount: 0, archivedCount: 0, failedCount: 0,
    persisted: true, fallback: 'certified-baseline', bundledBaselineContributing: false,
    runs: [], warnings: [],
    ...overrides,
  };
}
const runRow = (id, extra = {}) => ({ runId: id, ordinal: 1, status: 'COMPLETED', lifecycle: 'active', pinned: false, included: true, origin: 'session', createdAt: '2026-01-10T00:00:00.000Z', matchCount: 500, seat1WinRate: 0.5, compatibility: 'COMPATIBLE', exclusionReason: null, exclusionNote: null, rulesVersion: '4.3.1', engineVersion: '4.2.6', profileId: 'core-advanced-authority', policyIds: ['value', 'tempo'], canonicalResultHash: 'a'.repeat(64), runHash: 'b'.repeat(64), ...extra });
const experimentObservatory = { ...observatory, datasetOrigin: 'EXPERIMENT_RUNS' };

test('certified-corpus export declares the experiment has no recorded runs', () => {
  const d = buildAnalysisDossier(dossierInput({ experiments: experimentInput() }), { generatedAt: GENERATED });
  assert.equal(d.scope.datasetOrigin, 'CERTIFIED_CORPUS');
  assert.equal(d.scope.experiment.available, true);
  assert.equal(d.scope.experiment.selectedExperimentIncluded, false);
  assert.match(d.scope.experiment.exclusionReason, /No experiment runs recorded/);
  assert.equal(d.dataset.experiment.runCount, 0);
  assert.equal(d.companionArtifacts.experimentRuns.available, false);
  assert.match(d.companionArtifacts.experimentRuns.reason, /no session runs/i);
});

test('experiment-linked dataset reports contributing runs and identity', () => {
  const experiments = experimentInput({
    includedRunIds: ['RUN-001', 'RUN-002'], includedRunCount: 2, includedGames: 1500,
    totalRuns: 3, excludedRunCount: 1, excludedGames: 500, fallback: null,
    runs: [runRow('RUN-001'), runRow('RUN-002', { ordinal: 2 }), runRow('RUN-003', { ordinal: 3, included: false, exclusionReason: 'duplicate' })],
  });
  const d = buildAnalysisDossier(dossierInput({ observatory: experimentObservatory, experiments }), { generatedAt: GENERATED });
  assert.equal(d.scope.datasetOrigin, 'EXPERIMENT_RUNS');
  assert.equal(d.scope.experiment.selectedExperimentIncluded, true);
  assert.equal(d.scope.experiment.experimentId, 'EXP-LAB');
  assert.equal(d.scope.experiment.analysisSetId, 'SET-LAB');
  assert.deepEqual(d.scope.experiment.includedRunIds, ['RUN-001', 'RUN-002']);
  assert.equal(d.dataset.experiment.includedGames, 1500);
  assert.equal(d.experiment.runs.length, 3);
  const excluded = d.experiment.runs.find(r => r.runId === 'RUN-003');
  assert.equal(excluded.included, false);
  assert.equal(excluded.exclusionReason, 'duplicate');
  const md = renderAnalysisDossierMarkdown(d);
  assert.ok(md.includes('## Evidence Scope'), 'markdown exposes the scope section');
  assert.ok(md.includes('EXP-LAB'), 'markdown names the experiment');
  assert.ok(md.includes('Experiment included | yes'), 'markdown states inclusion');
});

test('selected-but-not-contributing experiment is fail-visible, never implied included', () => {
  // Runs exist in the store but the exported dataset is the certified corpus —
  // e.g. every run was excluded, or the store could not persist the selection.
  const experiments = experimentInput({
    totalRuns: 2, excludedRunCount: 2, excludedGames: 1000,
    runs: [runRow('RUN-001', { included: false, exclusionReason: 'other' }), runRow('RUN-002', { ordinal: 2, included: false, exclusionReason: 'exploratory' })],
  });
  const d = buildAnalysisDossier(dossierInput({ experiments }), { generatedAt: GENERATED });
  assert.equal(d.scope.datasetOrigin, 'CERTIFIED_CORPUS');
  assert.equal(d.scope.experiment.selectedExperimentIncluded, false);
  assert.match(d.scope.experiment.exclusionReason, /recorded but none contribute/);
  assert.ok(d.openQuestions.some(q => q.includes('EXP-LAB')), 'open questions surface the non-contributing experiment');
  const md = renderAnalysisDossierMarkdown(d);
  assert.ok(md.includes('no —'), 'markdown says the experiment is NOT included');
});

test('missing experiment evidence is an explicit unavailable domain', () => {
  const d = buildAnalysisDossier(dossierInput(), { generatedAt: GENERATED });
  assert.equal(d.experiment.available, false);
  assert.equal(d.scope.experiment.selectedExperimentIncluded, null);
  assert.ok(d.unavailable.some(u => u.domain === 'experiment'), 'unavailable domains declare experiment');
});

// ── Companion artifacts (v1.1) ───────────────────────────────────────────
test('companionArtifacts manifest reports strategy, runs, replays and experiment evidence', () => {
  const lab = labInput();
  lab.strategy = {
    sources: [
      { artifactId: 'SRC-1', origin: 'LOCAL', fidelity: 'full', fingerprint: 'aa', rulesProfile: 'core-advanced-authority', eraId: 'e1', eventCount: 5000, retainedEvents: 1200, checkpointIds: [], policyIds: ['value'], subjects: [], replayHash: 'h1' },
      { artifactId: 'SRC-2', origin: 'IMPORTED_UNVERIFIED', fidelity: 'sampled', fingerprint: 'aa', rulesProfile: 'core-advanced-authority', eraId: 'e1', eventCount: 3000, retainedEvents: 800, checkpointIds: [], policyIds: ['tempo'], subjects: [], replayHash: null },
    ],
    provenance: [], counts: { evidence: 2, sources: 2, events: 2 },
  };
  const experiments = experimentInput({
    includedRunIds: ['RUN-001'], includedRunCount: 1, includedGames: 500, totalRuns: 1,
    runs: [runRow('RUN-001')], fallback: null,
  });
  const d = buildAnalysisDossier(dossierInput({ lab, observatory: experimentObservatory, experiments }), { generatedAt: GENERATED });
  const ca = d.companionArtifacts;
  assert.equal(ca.strategy.available, true);
  assert.equal(ca.strategy.sourceCount, 2);
  assert.equal(ca.strategy.decisionEventCount, 8000);
  assert.equal(ca.strategy.retainedDecisionEventCount, 2000);
  assert.deepEqual(ca.strategy.artifactIds, ['SRC-1', 'SRC-2']);
  assert.equal(ca.strategy.origins.IMPORTED_UNVERIFIED, 1);
  assert.match(ca.strategy.authoritativeArtifact, /Strategy export bundle/);
  assert.equal(ca.runs.available, true);
  assert.ok(ca.runs.runIds.length >= 1);
  assert.equal(ca.experimentRuns.available, true);
  assert.equal(ca.experimentRuns.runCount, 1);
  assert.deepEqual(ca.experimentRuns.includedRunIds, ['RUN-001']);
  assert.equal(ca.replays.available, true);
  assert.ok(ca.replays.retainedReplayCount >= 1);
  const md = renderAnalysisDossierMarkdown(d);
  assert.ok(md.includes('## Companion Evidence'), 'markdown exposes the companion manifest');
  assert.ok(md.includes('8000'), 'markdown reports decision events');
});

test('empty-but-reachable strategy store is "none recorded", not unavailable noise', () => {
  const lab = labInput();
  lab.strategy = { sources: [], provenance: [], counts: { events: 0 } };
  const d = buildAnalysisDossier(dossierInput({ lab }), { generatedAt: GENERATED });
  assert.equal(d.companionArtifacts.strategy.available, false);
  assert.match(d.companionArtifacts.strategy.reason, /no evidence sources/i);
  assert.equal(d.companionArtifacts.strategy.decisionEventCount, 0);
});

// ── Integrity semantics (v1.1) ───────────────────────────────────────────
test('quarantine metrics are distinctly named: unregistered tags vs quarantined entities vs exempt', () => {
  const obs = structuredClone(observatory);
  // Ledger has 3 unregistered tags; only 2 tracked entities are quarantined —
  // the third tag belongs to a discovery-exempt entity (e.g. 'unclassified').
  obs.quarantineLedger = [{ tag: 'x1' }, { tag: 'x2' }, { tag: 'unclassified' }];
  obs.mechanics = [{ mechanic: 'x1', quarantined: true }, { mechanic: 'x2', quarantined: true }, { mechanic: 'unclassified', quarantined: false }];
  const d = buildAnalysisDossier(dossierInput({ observatory: obs }), { generatedAt: GENERATED });
  const q = d.integrity.quarantine;
  assert.equal(q.unregisteredTags, 3);
  assert.equal(q.quarantinedEntities, 2);
  assert.equal(q.discoveryExemptUnregistered, 1, 'the 3-vs-2 difference is explained, not silently dropped');
  const md = renderAnalysisDossierMarkdown(d);
  assert.ok(md.includes('unregistered telemetry tag(s) on tracked entities'), 'reconciliation line names what it counts');
  assert.ok(md.includes('discovery-exempt'), 'markdown discloses the exempt residue');
});

test('detailedMatchCount distinguishes unavailable (null) from measured zero', () => {
  const obsAbsent = { ...observatory };
  delete obsAbsent.detailedMatchCount;
  const d1 = buildAnalysisDossier(dossierInput({ observatory: obsAbsent }), { generatedAt: GENERATED });
  assert.equal(d1.dataset.detailedMatches, null, 'absent → null, never a fabricated zero');
  assert.equal(d1.observatory.detailedMatchCount, null);
  const md = renderAnalysisDossierMarkdown(d1);
  assert.ok(md.includes('unavailable (not collected)'), 'markdown says unavailable, not zero');
  const obsZero = { ...observatory, detailedMatchCount: 0 };
  const d2 = buildAnalysisDossier(dossierInput({ observatory: obsZero }), { generatedAt: GENERATED });
  assert.equal(d2.dataset.detailedMatches, 0, 'measured zero stays a number');
});

test('extractAnalysis never emits contradictory grade prose (ROBUST != insufficient)', () => {
  const obs = structuredClone(observatory);
  const mech = obs.mechanics[0];
  mech.evidenceGrade = 'ROBUST';
  mech.evidenceGradeLegacy = 'strong';
  const extract = extractAnalysis({ analytics: obs, aggregate });
  const row = extract.mechanicFindings.find(m => m.mechanic === mech.mechanic);
  assert.match(row.summary, /Evidence grade: ROBUST \(strong\)/);
  assert.doesNotMatch(row.summary, /ROBUST \(insufficient\)/);
  // No grade → no fabricated parenthetical.
  delete mech.evidenceGrade; delete mech.evidenceGradeLegacy;
  const extract2 = extractAnalysis({ analytics: obs, aggregate });
  const row2 = extract2.mechanicFindings.find(m => m.mechanic === mech.mechanic);
  assert.match(row2.summary, /Evidence grade: ungraded\./);
});

test('extract dataset.detailedMatchCount is null when the domain was not collected', () => {
  const obs = structuredClone(observatory);
  delete obs.detailedMatchCount;
  const extract = extractAnalysis({ analytics: obs, aggregate });
  assert.equal(extract.dataset.detailedMatchCount, null);
  const extract2 = extractAnalysis({ analytics: { ...obs, detailedMatchCount: 12 }, aggregate });
  assert.equal(extract2.dataset.detailedMatchCount, 12);
});

test('markdown Evidence Scope, Companion Evidence and JSON agree', () => {
  const lab = labInput();
  const experiments = experimentInput({ totalRuns: 1, includedRunIds: ['RUN-001'], includedRunCount: 1, includedGames: 500, runs: [runRow('RUN-001')], fallback: null });
  const d = buildAnalysisDossier(dossierInput({ lab, observatory: experimentObservatory, experiments }), { generatedAt: GENERATED });
  const md = renderAnalysisDossierMarkdown(d);
  for (const s of ['## Evidence Scope', '## Companion Evidence']) assert.ok(md.includes(s), `missing ${s}`);
  // Every scope number the markdown prints comes straight from the JSON.
  assert.equal(d.scope.experiment.includedGames, 500);
  assert.ok(md.includes('500'), 'markdown prints the same included-games figure as JSON');
});

// ── Evidence Status derivation (export hub) ──────────────────────────────
test('deriveEvidenceStatus: corpus-only has no lab runs, no deep tracking, no warnings', () => {
  const s = deriveEvidenceStatus({ observatory, experiments: experimentInput(), strategySources: [], strategyReachable: true });
  assert.equal(s.origin, 'CERTIFIED_CORPUS');
  assert.equal(s.sourceLabel, 'Certified Corpus');
  assert.equal(s.matches, observatory.summaryCount);
  assert.equal(s.deepTracking.state, 'none');
  assert.equal(s.labRuns.count, 0);
  assert.equal(s.warnings.length, 0);
});

test('deriveEvidenceStatus: experiment-linked shows experiment label and attached runs', () => {
  const experiments = experimentInput({ includedRunIds: ['RUN-001', 'RUN-002'], includedRunCount: 2, includedGames: 1500, totalRuns: 2, fallback: null, runs: [runRow('RUN-001'), runRow('RUN-002', { ordinal: 2 })] });
  const s = deriveEvidenceStatus({ observatory: experimentObservatory, experiments, strategySources: [], strategyReachable: true, labRunCount: 0 });
  assert.equal(s.sourceLabel, 'Experiment · EXP-LAB');
  assert.equal(s.labRuns.count, 2);
  assert.equal(s.experiment.included, true);
  assert.equal(s.warnings.length, 0);
});

test('deriveEvidenceStatus: recorded-but-not-contributing runs produce a warning', () => {
  const experiments = experimentInput({ totalRuns: 2, runs: [runRow('RUN-001', { included: false }), runRow('RUN-002', { ordinal: 2, included: false })] });
  const s = deriveEvidenceStatus({ observatory, experiments, strategySources: [], strategyReachable: true });
  assert.equal(s.origin, 'CERTIFIED_CORPUS');
  assert.ok(s.warnings.some(w => w.includes('recorded but none contribute')));
});

test('deriveEvidenceStatus: deep tracking states — persisted, imported-only, historical-only, enabled-no-evidence', () => {
  const src = (extra = {}) => ({ artifactId: 'S', origin: 'LOCAL', fidelity: 'full', fingerprint: 'fp1', eventCount: 84221, retainedEvents: 12000, ...extra });
  let s = deriveEvidenceStatus({ observatory, experiments: experimentInput(), strategySources: [src()], strategyReachable: true, labFingerprint: 'fp1' });
  assert.equal(s.deepTracking.state, 'persisted');
  assert.equal(s.deepTracking.decisionEvents, 84221);
  s = deriveEvidenceStatus({ observatory, experiments: experimentInput(), strategySources: [src({ origin: 'IMPORTED_UNVERIFIED' })], strategyReachable: true, labFingerprint: 'fp1' });
  assert.equal(s.deepTracking.state, 'imported-unverified');
  s = deriveEvidenceStatus({ observatory, experiments: experimentInput(), strategySources: [src({ fingerprint: 'other-fp' })], strategyReachable: true, labFingerprint: 'fp1' });
  assert.equal(s.deepTracking.state, 'historical-only');
  assert.ok(s.warnings.some(w => w.includes('different research fingerprint')));
  s = deriveEvidenceStatus({ observatory, experiments: experimentInput(), strategySources: [], strategyReachable: true, liveRunStrategicTrace: true });
  assert.equal(s.deepTracking.state, 'enabled-no-evidence');
  s = deriveEvidenceStatus({ observatory, experiments: experimentInput(), strategySources: null, strategyReachable: false });
  assert.equal(s.deepTracking.state, 'unavailable');
});
