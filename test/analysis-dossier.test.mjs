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
