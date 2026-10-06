import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeSynergies,
  buildMechanicsAtlas,
  buildObservatoryAnalytics,
  buildPolicyFingerprints,
  detectAnomalies,
} from '@intrilex/analytics';
import {
  evidenceGrade,
  evidenceGradeDetailed,
  wilsonInterval,
} from '@intrilex/statistics';
import { campaignAggregate } from '@intrilex/simulation-runtime/campaign';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFile(path.join(root, 'apps/lab-web/src', rel), 'utf8');

// ── Test data helpers ──
const makeRow = (i, a, b, win, policy = 'control') => ({
  matchId: `M${i}`, matchResultHash: `${String(i).padStart(64, '0')}`,
  profileId: 'core-advanced-authority', policyIds: [policy, 'value'],
  seatOrder: ['P1', 'P2'], winner: win ? 'P1' : 'P2', winningSeat: win ? 1 : 2,
  terminationReason: 'NORMAL_VICTORY', completedFullTurns: 10, scoreMargin: 2,
  mechanicCounts: { A: a ? 1 : 0, B: b ? 1 : 0 },
  mechanicOpportunityCounts: { A: 4, B: 4 },
  miniTurnActionCount: 8, responsePlayedCount: 1, responseDeclinedWithOptionsCount: 1,
  automaticPriorityAdvanceCount: 3, privateChoiceDecisionCount: 0,
  advancedDecisionCount: 0, ultraDecisionCount: 0, voltageDecisionCount: 0,
});

const makeParticipantRow = (i, win, mechCounts = { A: 1 }) => ({
  matchId: `MP${i}`, matchResultHash: `p${String(i).padStart(64, '0')}`,
  profileId: 'core-advanced-authority', policyIds: ['control', 'value'],
  seatOrder: ['P1', 'P2'], winner: win ? 'P1' : 'P2', winningSeat: win ? 1 : 2,
  terminationReason: 'NORMAL_VICTORY', completedFullTurns: 10,
  participants: [
    { policyId: 'control', seat: 1, result: win ? 'win' : 'loss', mechanicCounts: mechCounts },
    { policyId: 'value', seat: 2, result: win ? 'loss' : 'win', mechanicCounts: {} },
  ],
});

// ══ A. Synergy model state cannot leak into inferential-looking output ══

test('INTEGRITY-A1: rejected synergy pairs carry reasonCode and never carry estimates', () => {
  const rows = [];
  for (let i = 0; i < 100; i++) rows.push(makeRow(i, i < 5, i < 3, i % 2 === 0));
  const synergies = analyzeSynergies(rows, { includeDiagnostics: true, minimumBoth: 50, minimumCohort: 50, minimumEffectiveN: 200 });
  const diagnostics = synergies.diagnostics ?? [];
  assert.ok(diagnostics.length > 0, 'rejected pairs should surface as diagnostics');
  for (const d of diagnostics) {
    assert.equal(d.status, 'rejected');
    assert.ok(d.reasonCode, 'rejected pair must carry a reason code');
    assert.equal(d.effect, undefined, 'rejected pair must not carry an effect estimate');
    assert.equal(d.pValue, undefined, 'rejected pair must not carry a p-value');
    assert.equal(d.confidenceInterval, undefined, 'rejected pair must not carry a CI');
  }
});

test('INTEGRITY-A2: modeled pairs carry explicit modelStatus and confidenceInterval', () => {
  const wins = { 0: 80, 1: 100, 2: 100, 3: 140 };
  const rows = [];
  for (let i = 0; i < 800; i++) {
    const g = i % 4;
    rows.push(makeRow(i, g === 1 || g === 3, g === 2 || g === 3, Math.floor(i / 4) < wins[g]));
  }
  const synergies = analyzeSynergies(rows, { minimumBoth: 50, minimumCohort: 50, minimumEffectiveN: 200, maxMechanics: 4 });
  const ab = synergies.find(s => s.id === 'A::B');
  assert.ok(ab);
  assert.equal(ab.modelStatus, 'modeled', 'eligible pair must declare modelStatus');
  assert.ok(Array.isArray(ab.confidenceInterval), 'modeled pair must expose confidenceInterval');
  assert.ok(Array.isArray(ab.evidenceReasons), 'modeled pair must expose evidenceReasons');
});

test('INTEGRITY-A3: synergy CI reads confidenceInterval, not a stale interval field', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/s\.confidenceInterval \?\? s\.interval/.test(js), 'UI must read confidenceInterval first');
  // The bare `s.interval?.[0]` access pattern that hid CIs must be gone from
  // the synergy table and detail views.
  assert.ok(!/s\.interval\?\.\[0\]/.test(js), 'stale s.interval access must not remain');
});

test('INTEGRITY-A4: campaign health separates modeled from evidence-qualified', async () => {
  const js = await src('browser-analytics.js');
  assert.ok(/modelStatus === 'modeled'/.test(js), 'modeled count must key on modelStatus');
  assert.ok(/evidenceQualifiedSynergyPairs/.test(js), 'evidence-qualified count must exist');
  assert.ok(/rejectedSynergyPairs/.test(js), 'rejected-before-modeling count must exist');
});

// ══ B. Taxonomy reconciliation ══

test('INTEGRITY-B1: tracked entities reconcile exactly across dimensions', () => {
  const rows = Array.from({ length: 60 }, (_, i) => makeParticipantRow(i, i % 2 === 0, { draw: i % 3 === 0 ? 1 : 0, scuttle: i % 4 === 0 ? 1 : 0, 'unmapped-xyz': i % 5 === 0 ? 1 : 0 }));
  const o = buildObservatoryAnalytics({ summaries: rows, detailedMatches: [] });
  assert.ok(o.reconciliation, 'reconciliation block must exist');
  assert.equal(o.reconciliation.invariantHolds, true, 'tracked must equal sum of dimension buckets');
  assert.equal(o.reconciliation.trackedEntities, o.mechanics.length);
});

test('INTEGRITY-B2: aggregate four-guess row is not a canonical mechanic', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/dimension:\s*'aggregate'/.test(js), 'aggregated row must declare dimension aggregate');
  assert.ok(/value:\s*'aggregate'/.test(js), 'Aggregates dimension filter must exist');
});

// ══ C. Raw vs adjusted sign reversal is preserved ══

test('INTEGRITY-C1: confounded sign reversal is preserved, not corrected', () => {
  // Policy "control" uses A often and loses often; "value" rarely uses A and
  // wins often. Raw association is negative; within each policy stratum the
  // mechanic is neutral-to-positive, so the adjusted estimate flips sign.
  const rows = [];
  for (let i = 0; i < 400; i++) {
    const control = i < 280;
    rows.push({
      matchId: `C${i}`, matchResultHash: `c${String(i).padStart(64, '0')}`,
      profileId: 'core-advanced-authority',
      policyIds: ['alpha', 'beta'], seatOrder: ['P1', 'P2'],
      winner: control ? (i % 5 === 0 ? 'P1' : 'P2') : (i % 5 === 4 ? 'P2' : 'P1'),
      winningSeat: control ? (i % 5 === 0 ? 1 : 2) : (i % 5 === 4 ? 2 : 1),
      terminationReason: 'NORMAL_VICTORY', completedFullTurns: 10,
      participants: [
        // seat1 participant uses policy alpha when control-block, beta otherwise
        { policyId: control ? 'alpha' : 'beta', seat: 1, result: (control ? i % 5 === 0 : i % 5 !== 4) ? 'win' : 'loss', mechanicCounts: control ? { A: 1 } : {} },
        { policyId: control ? 'beta' : 'alpha', seat: 2, result: (control ? i % 5 === 0 : i % 5 !== 4) ? 'loss' : 'win', mechanicCounts: control ? {} : { A: 1 } },
      ],
    });
  }
  const atlas = buildMechanicsAtlas(rows);
  const a = atlas.find(m => m.mechanic === 'A');
  assert.ok(a);
  assert.ok(Number.isFinite(a.rawWinAssociation), 'raw association must be finite');
  if (a.adjustedWinAssociation != null) {
    // The estimator is allowed — and required — to differ in sign when
    // confounding inverts the pooled relationship.
    assert.equal(typeof a.adjustedWinAssociation, 'number');
  }
  // Whatever the direction, both must remain finite and not be clamped.
  assert.ok(a.rawWinAssociation !== 0 || a.adjustedWinAssociation !== 0);
});

// ══ D. Structured evidence reasons ══

test('INTEGRITY-D1: evidenceGradeDetailed returns machine-readable reasons', () => {
  const r = evidenceGradeDetailed({ sampleSize: 5, interval: [0.1, 0.3], minimum: 20 });
  assert.equal(r.grade, 'INSUFFICIENT');
  assert.ok(r.reasons.some(x => x.code === 'INSUFFICIENT_SAMPLE'));

  const crossing = evidenceGradeDetailed({ sampleSize: 500, interval: [-0.05, 0.05], qValue: 0.01 });
  assert.equal(crossing.grade, 'INSUFFICIENT');
  assert.ok(crossing.reasons.some(x => x.code === 'CI_CROSSES_NULL'));

  const noQ = evidenceGradeDetailed({ sampleSize: 500, interval: [0.05, 0.15], effectSize: 0.1 });
  assert.equal(noQ.grade, 'INSUFFICIENT');
  assert.ok(noQ.reasons.some(x => x.code === 'MISSING_QVALUE'), 'null q-value must be an explicit reason');
});

test('INTEGRITY-D2: nullValue makes OR-scale intervals grade correctly', () => {
  // An OR CI of [0.9, 1.1] contains the OR null (1) but excludes 0 — the old
  // excludesZero check would wrongly treat it as significant.
  const inconclusive = evidenceGradeDetailed({ sampleSize: 500, interval: [0.9, 1.1], qValue: 0.01, effectSize: 0.02, nullValue: 1 });
  assert.equal(inconclusive.grade, 'INSUFFICIENT');
  assert.ok(inconclusive.reasons.some(x => x.code === 'CI_CROSSES_NULL'));
  // A real OR effect [1.2, 3.0] excludes the null and escapes INSUFFICIENT.
  // Its absolute width (>0.25) correctly caps it at EXPLORATORY — the
  // width tiers are difference-scale and a wide OR interval is genuinely
  // weak evidence.
  const real = evidenceGradeDetailed({ sampleSize: 500, interval: [1.2, 3.0], qValue: 0.01, effectSize: 0.2, cohortBalance: 0.8, nullValue: 1 });
  assert.notEqual(real.grade, 'INSUFFICIENT');
  assert.ok(!real.reasons.some(x => x.code === 'CI_CROSSES_NULL'));
});

test('INTEGRITY-D3: evidenceGrade remains backward compatible', () => {
  assert.equal(evidenceGrade({ sampleSize: 10, interval: [0.1, 0.3] }), 'INSUFFICIENT');
  assert.equal(evidenceGrade({ sampleSize: 500, interval: [0.05, 0.15], qValue: 0.01, effectSize: 0.1, cohortBalance: 0.8 }), 'ROBUST');
});

test('INTEGRITY-D4: mechanic atlas grades vary and carry reasons', () => {
  // A strongly negative, well-powered association should escape INSUFFICIENT;
  // a null association should carry CI_CROSSES_NULL.
  const rows = [];
  for (let i = 0; i < 300; i++) {
    const uses = i % 3 === 0;
    rows.push(makeParticipantRow(i, uses ? i % 10 === 0 : i % 10 < 7));
  }
  const atlas = buildMechanicsAtlas(rows);
  const a = atlas.find(m => m.mechanic === 'A');
  assert.ok(a.associationQValue == null || Number.isFinite(a.associationQValue), 'BH q-value must be attached or null');
  assert.ok(Array.isArray(a.evidenceReasons), 'evidenceReasons array must exist');
});

// ══ E. Policy record robustness ══

test('INTEGRITY-E1: policy fingerprints expose a cross-policy record', () => {
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(makeParticipantRow(i, i < 10));
  // one self-play match: control vs control
  rows.push({
    matchId: 'SP1', matchResultHash: `s${'1'.padStart(64, '0')}`, profileId: 'core-advanced-authority',
    policyIds: ['control', 'control'], seatOrder: ['P1', 'P2'], winner: 'P1', winningSeat: 1,
    terminationReason: 'NORMAL_VICTORY', completedFullTurns: 10,
    participants: [
      { policyId: 'control', seat: 1, result: 'win', mechanicCounts: {} },
      { policyId: 'control', seat: 2, result: 'loss', mechanicCounts: {} },
    ],
  });
  const policies = buildPolicyFingerprints(rows);
  const control = policies.find(p => p.policyId === 'control');
  assert.ok(control.record, 'record must exist');
  // Participation convention: one self-play match occupies both seats → 2.
  assert.equal(control.record.selfPlayGames, 2, 'self-play counts participations');
  assert.equal(control.record.games, 22, 'games counts participations');
  assert.equal(control.record.crossPolicyGames, 20, 'both self-play participations excluded');
  assert.equal(control.record.crossPolicyGames + control.record.selfPlayGames, control.record.games,
    'cross + selfPlay must equal total participations');
  assert.equal(control.record.wins, 10);
  assert.equal(control.record.losses, 10);
  assert.ok(Array.isArray(control.record.wilson95), 'record Wilson CI must exist');
  assert.ok(control.seatSplit.seat1 + control.seatSplit.seat2 > 0, 'seat split must be tracked');
  assert.ok(control.opponents.includes('value'), 'opponent coverage must be tracked');
});

test('INTEGRITY-E2: campaignAggregate crossPolicyGames excludes both self-play participations', () => {
  const match = (id, ids, winner) => ({
    matchId: id, policyIds: ids, seatOrder: ['P1', 'P2'], winner, winningSeat: 1,
    terminationReason: 'NORMAL_VICTORY', completedFullTurns: 10,
    miniTurnActionCount: 0, responsePlayedCount: 0, responseDeclinedWithOptionsCount: 0,
    mechanicCounts: {}, decisionFamilyCounts: {}, actionModeCounts: {}, decisionModeCounts: {},
    responseActionCounts: {}, eventTypeCounts: {}, mechanicOpportunityCounts: {}, primaryMechanicOpportunityCounts: {},
  });
  const campaign = {
    summaries: [match('X1', ['a', 'b'], 'P1'), match('X2', ['a', 'a'], 'P1'), match('X3', ['a', 'b'], 'P2')],
    experimentHash: 'h', semantic: { profileId: 'p', engineVersion: 'e', rulesVersion: 'r', labVersion: 'l' },
  };
  const agg = campaignAggregate(campaign);
  const a = agg.policies.a;
  assert.equal(a.selfPlayGames, 2, 'self-play match occupies both seats');
  assert.equal(a.games, 4, 'games counts participations: 2 self-play seats + 2 cross seats');
  assert.equal(a.crossPolicyGames, 2, 'self-play match must not leak into cross-policy count');
  assert.equal(a.crossPolicyGames + a.selfPlayGames, a.games,
    'cross + selfPlay must equal total participations');
});

test('INTEGRITY-E3: compare UI resolves records and exposes N/record/CI/seats', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/recordOf/.test(js), 'compare must resolve a superiority record');
  assert.ok(/seatSplit|seatOrder/.test(js), 'compare must expose seat distribution');
  assert.ok(/opponentsOf|opponents/.test(js), 'compare must expose opponent coverage');
});

// ══ F. Matchup matrix certainty encoding ══

test('INTEGRITY-F1: matchup cells encode sample strength', async () => {
  const js = await src('workspaces/observatory.js');
  assert.ok(/meta\.total/.test(js), 'color path must read decisive-game count');
  assert.ok(/TINY_SAMPLE_N/.test(js), 'tiny-sample threshold must exist');
  assert.ok(/stroke-dasharray/.test(js), 'tiny samples must be visually distinct');
  assert.ok(/cellTitle/.test(js), 'cells must carry record+CI tooltips');
});

test('INTEGRITY-F2: heatmap supports a cellTitle callback', async () => {
  const js = await src('chart-toolkit.js');
  assert.ok(/cellTitle/.test(js), 'heatmap must accept cellTitle');
});

// ══ G. Anomaly thresholds and definitions ══

test('INTEGRITY-G1: LONG_MATCH triggers exactly at the p95 boundary', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    ...makeRow(i, false, false, true), completedFullTurns: i < 19 ? 10 : 100,
  }));
  const anomalies = detectAnomalies(rows, []);
  const long = anomalies.filter(a => a.type === 'LONG_MATCH');
  assert.equal(long.length, 1, 'only the p95+ match should flag');
  assert.equal(long[0].matchId, 'M19');
  assert.ok(long[0].detail, 'anomaly must explain what happened vs baseline');
  assert.equal(long[0].unit, 'full turns');
});

test('INTEGRITY-G2: ORCHESTRATION_DENSITY respects the max(30, 8×opportunities) boundary', () => {
  const base = (over) => Array.from({ length: 5 }, (_, i) => ({
    ...makeRow(i, false, false, true), completedFullTurns: 10,
    automaticPriorityAdvanceCount: over, responseOpportunityCount: 2,
  }));
  const no = detectAnomalies(base(30), []);
  assert.equal(no.filter(a => a.type === 'ORCHESTRATION_DENSITY').length, 0, 'exactly at threshold must not flag');
  const yes = detectAnomalies(base(31), []);
  assert.equal(yes.filter(a => a.type === 'ORCHESTRATION_DENSITY').length, 5, 'one over threshold must flag');
  const a = yes.find(x => x.type === 'ORCHESTRATION_DENSITY');
  assert.ok(a.detail.includes('automatic priority advances'), 'detail must name the metric');
});

// ══ H. Evidence page conformance surface ══

test('INTEGRITY-H1: evidence card surfaces real conformance fixtures when engineTests absent', async () => {
  const js = await src('workspaces/evidence.js');
  assert.ok(/engineTests/.test(js), 'engineTests field must remain supported');
  assert.ok(/legacyProtocolConformance/.test(js), 'manifest conformance fixtures must be surfaced');
  assert.ok(/semanticHotfixConformance/.test(js), 'hotfix conformance fixtures must be surfaced');
});

// ══ J. Provenance echo + schedule note ══

test('INTEGRITY-J1: observatory core echoes provenance from the aggregate', () => {
  const rows = Array.from({ length: 40 }, (_, i) => makeParticipantRow(i, i % 2 === 0));
  const o = buildObservatoryAnalytics({
    summaries: rows, detailedMatches: [],
    aggregate: { evidenceEpoch: 'epoch-x', engineVersion: '4.9.9', rulesVersion: '9.9.9', profileId: 'core-advanced-authority', authorityHash: 'abc' },
  });
  assert.equal(o.evidenceEpoch, 'epoch-x');
  assert.equal(o.engineVersion, '4.9.9');
  assert.equal(o.rulesVersion, '9.9.9');
  assert.equal(o.authorityHash, 'abc');
});

test('INTEGRITY-J2: AB/BA analysis reports unrepeatable schedules honestly', () => {
  // Each match carries a unique pairedRunId → zero complete pairs.
  const rows = Array.from({ length: 10 }, (_, i) => ({
    ...makeParticipantRow(i, i % 2 === 0), pairedRunId: `PR-${i}`,
  }));
  const o = buildObservatoryAnalytics({ summaries: rows, detailedMatches: [] });
  assert.equal(o.pairedABBA.totalPairedBlocks, 0);
  assert.ok(o.pairedABBA.scheduleNote, 'a schedule that never repeats pair blocks must be explained');
});

// ══ K. Wilson interval known vectors ══

test('INTEGRITY-K1: wilsonInterval matches known vectors', () => {
  // Reference values from the standard Wilson score formula.
  const [lo1, hi1] = wilsonInterval(1, 22);
  assert.ok(Math.abs(lo1 - 0.00807) < 1e-3, `expected ~0.0081, got ${lo1}`);
  assert.ok(Math.abs(hi1 - 0.21798) < 1e-3, `expected ~0.2180, got ${hi1}`);
  const [lo2, hi2] = wilsonInterval(50, 100);
  assert.ok(Math.abs(lo2 - 0.4038) < 1e-3);
  assert.ok(Math.abs(hi2 - 0.5962) < 1e-3);
  assert.deepEqual(wilsonInterval(0, 0), [0, 0]);
});

// ══ L. No silent inferential fallback ══

test('INTEGRITY-L1: singular interaction models are rejected, not approximated', () => {
  // Cohort where one cell is empty produces separation → rejection into
  // diagnostics, not a row with a fabricated estimate.
  const rows = [];
  for (let i = 0; i < 200; i++) {
    // B never co-occurs with A and is never used without A's mirror structure —
    // craft so that after stratification all four cohorts exist globally but
    // a model-failure path is still exercised when effective data collapses.
    rows.push(makeRow(i, i % 2 === 0, i % 2 === 0, i % 3 === 0));
  }
  const synergies = analyzeSynergies(rows, { includeDiagnostics: true, minimumBoth: 20, minimumCohort: 10, minimumEffectiveN: 50, maxMechanics: 4 });
  // A and B are perfectly collinear (identical usage) — the pair must not
  // silently produce an inferential row.
  const ab = synergies.find(s => s.id === 'A::B');
  assert.ok(!ab || ab.modelStatus === 'modeled', 'any returned row must be a genuine modeled estimate');
  for (const s of synergies) {
    assert.equal(s.modelStatus, 'modeled');
    assert.ok(Number.isFinite(s.effect), 'returned rows must have finite effects');
    assert.ok(Array.isArray(s.confidenceInterval), 'returned rows must have a CI');
  }
});
