// Measurement-integrity contracts (final hardening pass before the next
// campaign). Each test encodes the correct statistical contract, not
// historical behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyzeSynergies, buildMechanicsAtlas, buildPolicyFingerprints, metricRegistryWithHashes } from '@intrilex/analytics';
import { buildVariantAnalytics } from '@intrilex/analytics/rank-integration';
import { applyRankBalanceQualification, deriveTagRelations, synergyCellStatus } from '@intrilex/analytics/observatory-integrity';
import {
  benjaminiHochberg, evidenceGradeDetailed, evidenceGradeLegacy, LEGACY_GRADE_MAP, shrinkLogOddsRatio,
  stratifiedInteractionEstimate, wilsonInterval, winRateRecord,
} from '@intrilex/statistics';
import { campaignAggregate } from '@intrilex/simulation-runtime/campaign';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/lab-web/dist');
const distModule = (rel) => import(pathToFileURL(path.join(dist, rel)).href);
const close = (a, b, eps = 1e-12) => Math.abs(a - b) < eps;
const cell = (wins, losses) => ({ wins, losses });

const row = (i, a, b, win, extra = {}) => ({
  matchId: `M${i}`, matchResultHash: String(i).padStart(64, '0'), profileId: 'core-advanced-authority',
  policyIds: ['control', 'value'], seatOrder: ['P1', 'P2'], winner: win ? 'P1' : 'P2', winningSeat: win ? 1 : 2,
  terminationReason: 'NORMAL_VICTORY', completedFullTurns: 10,
  mechanicCounts: { A: a ? 1 : 0, B: b ? 1 : 0, ...(extra.counts ?? {}) }, mechanicOpportunityCounts: { A: 4, B: 4 },
  decisionModeCounts: extra.modes ?? {},
});
function interactionRows(wins = { 0: 60, 1: 80, 2: 80, 3: 160 }) {
  const rows = [];
  for (let i = 0; i < 800; i++) {
    const g = i % 4;
    rows.push(row(i, g === 1 || g === 3, g === 2 || g === 3, Math.floor(i / 4) < wins[g]));
  }
  return rows;
}

// ── 1–3. Odds-ratio shrinkage and ranking ──────────────────────
test('OR shrinkage moves every estimate toward OR = 1 on the log scale', () => {
  for (const or of [3, 1.5, 0.667, 0.2]) {
    const { shrunkOR, shrinkageFactor } = shrinkLogOddsRatio(Math.log(or), 100);
    assert.ok(shrinkageFactor > 0 && shrinkageFactor < 1);
    assert.ok(Math.abs(Math.log(shrunkOR)) < Math.abs(Math.log(or)), `OR ${or} must move toward 1, got ${shrunkOR}`);
    assert.equal(Math.sign(Math.log(shrunkOR)), Math.sign(Math.log(or)), 'shrinkage never crosses the null');
  }
  assert.equal(shrinkLogOddsRatio(0, 100).shrunkOR, 1, 'OR = 1 stays 1');
  // The reported regression: raw OR 0.667 previously shrank to 0.596 (away from 1).
  assert.ok(shrinkLogOddsRatio(Math.log(0.667), 212).shrunkOR > 0.667);
});

test('synergy ranking strength is symmetric around OR = 1', () => {
  const up = shrinkLogOddsRatio(Math.log(2), 80), down = shrinkLogOddsRatio(Math.log(0.5), 80);
  assert.ok(close(Math.abs(up.shrunkLogOR), Math.abs(down.shrunkLogOR)), 'OR 2 and OR 0.5 must rank equally');
  const rows = analyzeSynergies(interactionRows(), { minimumBoth: 50, minimumCohort: 50, minimumEffectiveN: 200, maxMechanics: 4 });
  for (const s of rows) assert.ok(close(s.rankStrength, Math.abs(s.shrunkLogOR)), 'rank strength is |shrunk log OR|, never |OR|');
});

// ── 4–5. Effective N and separation disclosure ─────────────────
test('rejected strata contribute nothing to effective N', () => {
  const big = { neither: cell(400, 400), aOnly: cell(300, 0), bOnly: cell(200, 200), both: cell(100, 100) }; // A-only separated
  const small = { neither: cell(10, 10), aOnly: cell(12, 8), bOnly: cell(9, 11), both: cell(14, 6) };
  const r = stratifiedInteractionEstimate([big, small], { stratumKeys: ['big', 'small'] });
  assert.equal(r.estimatorSucceeded, true);
  assert.equal(r.contributingN, 80);
  assert.equal(r.effectiveN, 80, 'effectiveN is the contributing support, not 1780');
  assert.equal(r.eligibleN, 1780);
  assert.equal(r.excludedN, 1700);
  assert.equal(r.strataContributing, 1);
  assert.deepEqual(r.excludedStrata, [{ stratum: 'big', reason: 'OUTCOME_SEPARATION', n: 1700 }]);
});

test('partial separation survives a successful pooled estimate', () => {
  const sep = { neither: cell(5, 5), aOnly: cell(6, 0), bOnly: cell(4, 4), both: cell(3, 3) };
  const empty = { neither: cell(5, 5), aOnly: cell(0, 0), bOnly: cell(4, 4), both: cell(3, 3) };
  const ok = { neither: cell(20, 20), aOnly: cell(25, 15), bOnly: cell(18, 22), both: cell(28, 12) };
  const r = stratifiedInteractionEstimate([sep, empty, ok]);
  assert.equal(r.estimatorSucceeded, true);
  assert.equal(r.separation, true, 'separation is no longer erased by partial success');
  assert.equal(r.anyStratumSeparated, true);
  assert.equal(r.separationAffectedEstimate, true);
  assert.equal(r.emptyCohortStrata, 1, 'an empty cohort is a structural zero, not separation');
  assert.equal(r.separatedStrata, 1);
  const none = stratifiedInteractionEstimate([empty]);
  assert.equal(none.estimatorSucceeded, false);
  assert.equal(none.failureReason, 'NO_WITHIN_STRATUM_VARIATION');
  assert.equal(stratifiedInteractionEstimate([sep]).failureReason, 'SEPARATION');
});

// ── 6–7. Scale-aware evidence grading and legacy agreement ─────
test('OR evidence precision is graded on log(OR), symmetrically around 1', () => {
  const base = { sampleSize: 500, qValue: 0.01, cohortBalance: 0.8, scale: 'odds-ratio' };
  const hi = evidenceGradeDetailed({ ...base, interval: [1.2, 1.8], effectSize: 1.47 });
  const lo = evidenceGradeDetailed({ ...base, interval: [1 / 1.8, 1 / 1.2], effectSize: 1 / 1.47 });
  assert.equal(hi.grade, lo.grade, 'reciprocal ORs must grade identically');
  assert.equal(hi.grade, 'ROBUST', 'log width 0.405 ≤ 0.6 meets the translated ROBUST precision');
  // OR-unit width 0.6 would have failed the additive 0.15 rule; log scale is the contract.
  const wide = evidenceGradeDetailed({ ...base, interval: [1.1, 4.0], effectSize: 2 });
  assert.equal(wide.grade, 'EXPLORATORY');
  assert.ok(wide.reasons.length === 0 || !wide.reasons.some((r) => r.code === 'CI_CROSSES_NULL'));
  const crosses = evidenceGradeDetailed({ ...base, interval: [0.9, 1.1], effectSize: 1 });
  assert.ok(crosses.reasons.some((r) => r.code === 'CI_CROSSES_NULL'));
  assert.ok(evidenceGradeDetailed({ ...base, interval: [-0.1, 2] }).reasons.some((r) => r.code === 'INVALID_INTERVAL'));
});

test('legacy evidence grade is a pure mapping of the modern grade', () => {
  const params = { sampleSize: 500, interval: [1.2, 1.8], qValue: 0.01, cohortBalance: 0.8, effectSize: 1.47, scale: 'odds-ratio' };
  assert.equal(evidenceGradeLegacy(params), LEGACY_GRADE_MAP[evidenceGradeDetailed(params).grade]);
  for (const s of analyzeSynergies(interactionRows(), { minimumBoth: 50, minimumCohort: 50, minimumEffectiveN: 200, maxMechanics: 4 })) {
    assert.equal(s.evidenceGradeLegacy, LEGACY_GRADE_MAP[s.evidenceGrade]);
    assert.equal(s.evidenceScale, 'odds-ratio');
  }
  const rows = Array.from({ length: 300 }, (_, i) => row(i, i % 3 === 0, false, i % 3 === 0 ? i % 10 < 8 : i % 10 < 4));
  for (const m of buildMechanicsAtlas(rows)) assert.equal(m.evidenceGradeLegacy, LEGACY_GRADE_MAP[m.evidenceGrade]);
});

// ── 8. Canonical ↔ browser provenance parity ───────────────────
test('canonical and browser formula hashes are identical for every metric', { skip: !existsSync(path.join(dist, 'shared-analytics/metric-registry.mjs')) && 'dist not built' }, async () => {
  const canonical = metricRegistryWithHashes();
  const { buildObservatoryAnalytics } = await distModule('browser-analytics.js');
  const browser = buildObservatoryAnalytics({ summaries: interactionRows().slice(0, 40) }).metricRegistry;
  assert.deepEqual(Object.keys(browser).sort(), Object.keys(canonical).sort());
  for (const id of Object.keys(canonical)) {
    assert.equal(browser[id].formulaHash, canonical[id].formulaHash, `${id} hash parity`);
    assert.equal(browser[id].version, canonical[id].version, `${id} version parity`);
  }
});

test('no browser source carries its own metric formula literals', async () => {
  const dir = path.join(root, 'apps/lab-web/src');
  for (const name of (await readdir(dir)).filter((n) => n.endsWith('.js'))) {
    const js = await readFile(path.join(dir, name), 'utf8');
    assert.ok(!/stratified joint outcome rate|sum secured point delta in declaration state transition/.test(js), `${name} holds a stale formula string`);
    assert.ok(!/'synergy-interaction':\s*\{\s*version/.test(js), `${name} redefines a metric`);
  }
});

test('browser and canonical synergy + mechanics outputs agree on a shared fixture', { skip: !existsSync(path.join(dist, 'shared-analytics/observatory-core.mjs')) && 'dist not built' }, async () => {
  const browserMod = await distModule('observatory-analytics-browser.js');
  const rows = interactionRows();
  const opts = { minimumBoth: 50, minimumCohort: 50, minimumEffectiveN: 200, maxMechanics: 4 };
  const pick = (s) => ({ id: s.id, modelOR: s.modelOR, shrunkOR: s.shrunkOR, ci: s.confidenceInterval, q: s.qValue, effectiveN: s.effectiveN, grade: s.evidenceGrade, cls: s.relationshipClass, hash: s.formulaHash });
  assert.deepEqual(browserMod.analyzeSynergies(rows, opts).map(pick), analyzeSynergies(rows, opts).map(pick));
  const m = (x) => ({ mechanic: x.mechanic, q: x.associationQValue, grade: x.evidenceGrade, outcome: x.outcomeFormulaHash, eligible: x.inferential.eligible });
  assert.deepEqual(browserMod.buildMechanicsAtlas(rows).map(m), buildMechanicsAtlas(rows).map(m));
});

// ── 9–10. Compare denominator contract with draws and aborts ───
const policyMatch = (id, winner, terminationReason = 'NORMAL_VICTORY') => ({
  matchId: id, policyIds: ['alpha', 'beta'], seatOrder: ['P1', 'P2'], terminationReason, completedFullTurns: 10,
  winner: terminationReason === 'CANONICAL_DRAW' ? 'DRAW' : terminationReason === 'NORMAL_VICTORY' ? winner : 'ABORTED',
  winningSeat: terminationReason === 'NORMAL_VICTORY' ? (winner === 'P1' ? 1 : 2) : null,
});
const mixed = [
  ...Array.from({ length: 6 }, (_, i) => policyMatch(`W${i}`, 'P1')),
  ...Array.from({ length: 2 }, (_, i) => policyMatch(`L${i}`, 'P2')),
  ...Array.from({ length: 3 }, (_, i) => policyMatch(`D${i}`, null, 'CANONICAL_DRAW')),
  policyMatch('X0', null, 'DECISION_LIMIT'),
];

test('policy record point estimate and CI share the decisive denominator', () => {
  const alpha = buildPolicyFingerprints(mixed).find((p) => p.policyId === 'alpha');
  const r = alpha.record;
  assert.deepEqual([r.wins, r.losses, r.draws, r.aborts, r.decisive], [6, 2, 3, 1, 8]);
  assert.equal(r.winRate, 6 / 8);
  assert.deepEqual(r.wilson95, wilsonInterval(6, 8));
  assert.equal(r.allGamesWinRate, 6 / 12);
  assert.deepEqual(r.allGamesWilson95, wilsonInterval(6, 12));
  assert.ok(r.wilson95[0] <= r.winRate && r.winRate <= r.wilson95[1]);
  assert.equal(winRateRecord({ draws: 3 }).wilson95, null, 'no decisive games → no invented interval');
});

test('campaign aggregates (canonical and browser) honor the same contract', async () => {
  const agg = campaignAggregate({ summaries: mixed, experimentHash: 'h', semantic: { profileId: 'p', engineVersion: 'e', rulesVersion: 'r', labVersion: 'l' } });
  const a = agg.policies.alpha;
  assert.equal(a.winRate, a.wins / a.decisiveGames);
  assert.deepEqual(a.wilson95, wilsonInterval(a.wins, a.decisiveGames));
  assert.equal(a.allGamesWinRate, a.wins / a.crossPolicyGames);
  if (existsSync(path.join(dist, 'browser-analytics.js'))) {
    const { campaignAggregate: browserAggregate } = await distModule('browser-analytics.js');
    const b = browserAggregate(mixed, {}).policies.alpha;
    for (const k of ['wins', 'draws', 'aborts', 'decisiveGames', 'winRate', 'allGamesWinRate']) assert.equal(b[k], a[k], `browser ${k}`);
    assert.deepEqual(b.wilson95, a.wilson95);
  }
});

// ── 11. Interaction direction semantics ────────────────────────
test('modelDirection follows log(OR); marginal direction is separate', () => {
  const sign = (x) => (x > 0 ? 'positive' : x < 0 ? 'negative' : 'null');
  for (const wins of [{ 0: 60, 1: 80, 2: 80, 3: 160 }, { 0: 120, 1: 100, 2: 100, 3: 60 }]) {
    const s = analyzeSynergies(interactionRows(wins), { minimumBoth: 50, minimumCohort: 50, minimumEffectiveN: 200, maxMechanics: 4 }).find((x) => x.id === 'A::B');
    assert.equal(s.modelDirection, sign(s.logOR));
    assert.equal(s.marginalDirection, sign(s.marginalInteractionPP));
    assert.equal(s.relationshipClass, s.logOR > 0 ? 'synergy' : 'anti-synergy');
    assert.equal(s.relationshipClassBasis, 'model-log-odds');
    if (s.status !== 'inconclusive') assert.equal(s.status, s.logOR > 0 ? 'positive' : 'negative');
  }
});

// ── 12–13. Opportunity accounting and rank qualification ───────
const tenDecision = (suit, variantOpportunities) => ({
  participantId: 'P1',
  rankAttribution: { primaryRank: '10', sourceRanks: ['10'], rankWeights: { 10: 1 }, playForm: 'score', attributionStatus: 'exact', sourceCards: [{ rank: '10', suit }] },
  rankOpportunities: [{ rank: '10', opportunityFrames: 1, legalOptions: 1 }],
  variantOpportunities,
  action: { family: 'score', mode: 'points' }, legalActions: [],
});

test('per-suit Ten opportunities are never synthesized from the rank count', () => {
  const summaries = [{ matchId: 'T1', winner: 'P1', seatOrder: ['P1', 'P2'], rankDecisions: [
    tenDecision('♣', [{ variantKey: '10', opportunityFrames: 1, legalOptions: 2 }, { variantKey: '10:club', opportunityFrames: 1, legalOptions: 1 }, { variantKey: '10:spade', opportunityFrames: 1, legalOptions: 1 }]),
  ] }];
  const vm = buildVariantAnalytics({ summaries }).variantMetrics;
  assert.equal(vm['10:club'].variantOpportunityCount, 1);
  assert.equal(vm['10:spade'].variantOpportunityCount, 1, 'recorded spade opportunity is kept');
  assert.equal(vm['10:diamond'].variantOpportunityCount, 0, 'no invented diamond opportunity');
  assert.equal(vm['10:heart'].variantOpportunityCount, 0, 'no invented heart opportunity');
  // Legacy rows (no variantOpportunities) cannot say which suit was legal.
  const legacy = buildVariantAnalytics({ summaries: [{ matchId: 'T2', winner: 'P1', seatOrder: ['P1', 'P2'], rankDecisions: [tenDecision('♠', undefined)] }] }).variantMetrics;
  assert.equal(legacy['10:spade'].variantSelectionCount, 1);
  assert.equal(legacy['10:spade'].variantOpportunityCount, 0, 'legacy per-suit denominator stays unknown');
});

test('selections without opportunities disqualify the rank and its aggregate', () => {
  const entry = (sel, opp, extra = {}) => ({ rpi: 0.9, confidence: 'HIGH', metrics: { selectionCount: sel, opportunityCount: opp }, axisStatus: { selectionPower: 'observed', victoryPower: 'observed', scorePower: 'observed', boardPower: 'observed' }, ...extra });
  const rankPower = {
    ranks: { '10:spade': entry(3000, 0, { confidence: 'INSUFFICIENT' }), 7: entry(50, 400), K: entry(60, 300) },
    ladder: [{ rank: '10:spade', rpi: 0.95 }, { rank: '7', rpi: 0.9 }, { rank: 'K', rpi: 0.5 }],
    watchlist: { overpowered: [{ rank: '10:spade' }, { rank: '7' }], underpowered: [], dominant: [], negligible: [] },
  };
  const variantAnalytics = { variantMetrics: { 7: { variantSelectionCount: 50, variantOpportunityCount: 400 }, '7:spade': { variantSelectionCount: 9, variantOpportunityCount: 0 } } };
  const q = applyRankBalanceQualification(rankPower, variantAnalytics);
  assert.equal(q.ranks['10:spade'].integrity.status, 'FAIL');
  assert.equal(q.ranks['10:spade'].balanceQualified, false);
  assert.equal(q.ranks['7'].integrity.status, 'FAIL', 'a child variant failure contaminates the rank');
  assert.ok(q.ranks['7'].balanceQualification.reasons.some((r) => r.code === 'INTEGRITY_SELECTIONS_WITHOUT_OPPORTUNITIES'));
  assert.equal(q.ranks.K.balanceQualified, true);
  assert.deepEqual(q.watchlist.overpowered, [], 'disqualified ranks leave the balance watchlist');
  assert.equal(q.watchlist.integritySuppressed.length, 2);
  assert.equal(q.balanceQualification.descriptiveLeader, '10:spade');
  assert.equal(q.balanceQualification.qualifiedLeader, 'K');
  assert.equal(q.ladder[0].balanceQualified, false);
});

test('browser runtime records variant opportunities (no zero-opportunity selections)', { skip: !existsSync(path.join(dist, 'autonomy-runtime.js')) && 'dist not built' }, async () => {
  const { runBrowserPolicyMatch } = await distModule('autonomy-runtime.js');
  const { reconcileVariantAnalytics } = await import('@intrilex/analytics/rank-integration');
  const summaries = [11, 12, 13].map((seed) => runBrowserPolicyMatch({ seed, policyIds: ['tempo', 'control'], profileId: 'core-advanced-authority' }));
  assert.ok(summaries.every((s) => s.rankDecisions.some((d) => Array.isArray(d.variantOpportunities) && d.variantOpportunities.length)));
  const violations = reconcileVariantAnalytics(buildVariantAnalytics({ summaries })).violations.filter((v) => v.invariant === 'SELECTIONS_WITHOUT_OPPORTUNITIES');
  assert.deepEqual(violations, []);
});

// ── 16–19. Taxonomy, duplicates, cell semantics, BH family ─────
test('family/mode tags of the same action are never synergy candidates', () => {
  const rows = Array.from({ length: 400 }, (_, i) => {
    const fam = i % 2 === 0, mode = fam && i % 4 === 0;
    return row(i, i % 3 === 0, i % 5 === 0, i % 7 < 4, { counts: { fam: fam ? 1 : 0, mode: mode ? 1 : 0 }, modes: fam ? { 'fam:mode': 1 } : {} });
  });
  const result = analyzeSynergies(rows, { includeDiagnostics: true, minimumBoth: 5, minimumCohort: 5, minimumEffectiveN: 20, maxMechanics: 6 });
  assert.ok(!result.some((s) => s.id === 'fam::mode'), 'same-event pair must not be modeled');
  assert.equal(result.diagnostics.find((d) => d.id === 'fam::mode')?.reasonCode, 'SAME_EVENT_DEPENDENT');
});

test('identical-usage tags count once in mechanics BH and synergy candidates', () => {
  const rows = Array.from({ length: 300 }, (_, i) => {
    const used = i % 3 === 0;
    return row(i, used, false, used ? i % 10 < 8 : i % 10 < 4, { counts: { 'effect-three': used ? 1 : 0, 'bounce-top': used ? 1 : 0 }, modes: used ? { 'effect-three:bounce-top': 1 } : {} });
  });
  const relations = deriveTagRelations(rows, rows, ['A', 'B', 'effect-three', 'bounce-top']);
  assert.equal(relations.aliasOf['bounce-top'], 'effect-three', 'family represents its sole mode');
  const atlas = buildMechanicsAtlas(rows);
  const child = atlas.find((m) => m.mechanic === 'bounce-top');
  assert.equal(child.inferential.reasonCode, 'ALIAS_OF');
  assert.equal(child.associationQValue, null, 'alias does not enter the BH family');
  const syn = analyzeSynergies(rows, { includeDiagnostics: true, minimumBoth: 5, minimumCohort: 5, minimumEffectiveN: 20 });
  assert.ok(syn.candidateSet.excludedTags.some((t) => t.tag === 'bounce-top' && t.reasonCode === 'IDENTICAL_USAGE'));
  assert.ok(!syn.candidateSet.mechanics.includes('bounce-top'));
});

test('BH family contains exactly the valid inferential mechanic hypotheses', () => {
  const rows = Array.from({ length: 300 }, (_, i) => row(i, i % 3 === 0, i % 2 === 0, i % 10 < 5, { counts: { scuttle: i % 4 === 0 ? 1 : 0, discard: i % 5 === 0 ? 1 : 0, 'rare-tag': i === 7 ? 1 : 0 } }));
  const atlas = buildMechanicsAtlas(rows);
  const family = atlas.filter((m) => m.inferential.eligible);
  assert.ok(family.every((m) => ['canonical-mechanic', 'rank-effect'].includes(m.dimension) && Number.isFinite(m.pValue)));
  const expected = new Map(benjaminiHochberg(family, { idKey: 'mechanic' }).map((m) => [m.mechanic, m.qValue]));
  for (const m of atlas) assert.equal(m.associationQValue, expected.get(m.mechanic) ?? null, `${m.mechanic} q-value`);
  assert.equal(atlas.find((m) => m.mechanic === 'discard').inferential.reasonCode, 'DESCRIPTIVE_ONLY_DIMENSION');
  assert.equal(atlas.find((m) => m.mechanic === 'discard').evidenceReasons[0].code, 'DESCRIPTIVE_ONLY_DIMENSION');
});

test('blank synergy cells keep UNKNOWN / FAILED / NOT IDENTIFIABLE semantics', () => {
  assert.equal(synergyCellStatus({ reasonCode: 'INSUFFICIENT_BOTH' }), 'INSUFFICIENT_DATA');
  assert.equal(synergyCellStatus({ reasonCode: 'SAME_EVENT_DEPENDENT' }), 'NOT_IDENTIFIABLE');
  assert.equal(synergyCellStatus({ reasonCode: 'NO_WITHIN_STRATUM_VARIATION' }), 'NOT_IDENTIFIABLE');
  assert.equal(synergyCellStatus({ reasonCode: 'SEPARATION' }), 'FAILED');
  assert.equal(synergyCellStatus({ modelStatus: 'modeled', status: 'inconclusive' }), 'MODELED_INCONCLUSIVE');
  const result = analyzeSynergies(interactionRows(), { includeDiagnostics: true, minimumBoth: 50, minimumCohort: 50, minimumEffectiveN: 200 });
  for (const d of result.diagnostics) assert.ok(d.cellStatus && d.cellStatus !== 'MODELED_INCONCLUSIVE', 'rejected pairs are never neutral');
  assert.equal(result.candidateSet.unevaluatedPairStatus, 'NOT_EVALUATED');
});

// ── 20. Provenance through serialization ───────────────────────
test('mechanic and synergy rows carry the hash of the metric they report', () => {
  const reg = metricRegistryWithHashes();
  const m = buildMechanicsAtlas(interactionRows().slice(0, 200))[0];
  assert.equal(m.outcomeFormulaHash, reg['raw-win-association'].formulaHash, 'raw association is not hashed as synergy');
  assert.equal(m.adjustedFormulaHash, reg['adjusted-win-association'].formulaHash);
  const s = analyzeSynergies(interactionRows(), { minimumBoth: 50, minimumCohort: 50, minimumEffectiveN: 200, maxMechanics: 4 })[0];
  assert.equal(s.formulaHash, reg['synergy-interaction'].formulaHash);
  assert.equal(JSON.parse(JSON.stringify(s)).formulaHash, s.formulaHash);
});


// ── 21. Browser evidence provenance lifecycle ──────────────────
// Generated evidence from a verified run must not invalidate its own source
// provenance: generated output roots are not source dirt, while modified
// tracked files and stray untracked source files remain fail-closed.
test('evidence provenance: generated outputs do not dirty source, source dirt fails closed', async () => {
  const { captureProvenance, evidenceProvenanceProblems, GENERATED_OUTPUT_ROOTS } = await import('../scripts/release-provenance.mjs');
  const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { execSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');

  const repo = mkdtempSync(path.join(tmpdir(), 'provenance-'));
  execSync('git init -q', { cwd: repo });
  execSync('git config user.email t@t && git config user.name t', { cwd: repo });
  writeFileSync(path.join(repo, 'pnpm-lock.yaml'), '{}');
  writeFileSync(path.join(repo, 'src.js'), 'export {};\n');
  // captureProvenance requires these inputs to classify a provenance as valid.
  mkdirSync(path.join(repo, 'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix'), { recursive: true });
  writeFileSync(path.join(repo, 'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/PRIORITY_PASS_HOTFIX_MANIFEST.json'),
    JSON.stringify({ payloadHash: 'a'.repeat(64), version: '4.2.6' }));
  mkdirSync(path.join(repo, 'config'), { recursive: true });
  writeFileSync(path.join(repo, 'config/release-identity.json'), JSON.stringify({ rulesVersion: '4.3.1' }));
  writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  execSync('git add -A && git commit -qm init', { cwd: repo });

  // clean source: no problems
  let current = captureProvenance(repo);
  assert.equal(current.dirty, false);
  const report = { provenance: { ...current, mode: 'full' }, quickMode: false };
  assert.deepEqual(evidenceProvenanceProblems(report, current), []);

  // generated output under a whitelisted root does not dirty source
  mkdirSync(path.join(repo, 'release'), { recursive: true });
  writeFileSync(path.join(repo, 'release', 'artifact.json'), '{}');
  current = captureProvenance(repo);
  assert.equal(current.dirty, false, 'generated output under release/ is not source dirt');
  assert.deepEqual(current.dirtyGeneratedPaths, ['release/artifact.json']);
  assert.deepEqual(evidenceProvenanceProblems(report, current), []);

  // dirty source before/at capture -> certification fails
  writeFileSync(path.join(repo, 'untracked-source.mjs'), 'export {};\n');
  const dirty = captureProvenance(repo);
  assert.equal(dirty.dirty, true);
  assert.ok(dirty.dirtySourcePaths.includes('untracked-source.mjs'));
  const dirtyReport = { provenance: { ...dirty, mode: 'full' }, quickMode: false };
  assert.ok(evidenceProvenanceProblems(dirtyReport, dirty).length > 0, 'dirty source evidence rejected');

  // modified tracked file -> source dirt -> FAIL
  writeFileSync(path.join(repo, 'src.js'), 'export {};//drift' + String.fromCharCode(10));
  const drifted = captureProvenance(repo);
  assert.equal(drifted.dirty, true);
  assert.ok(evidenceProvenanceProblems(dirtyReport, drifted).length > 0);

  // report captured on a different commit/source state -> FAIL
  execSync('git checkout -q -- src.js', { cwd: repo });
  (await import('node:fs')).rmSync(path.join(repo, 'untracked-source.mjs'));
  const other = captureProvenance(repo);
  const foreign = { provenance: { ...other, mode: 'full', gitCommit: '0'.repeat(40) }, quickMode: false };
  const problems = evidenceProvenanceProblems(foreign, current);
  assert.ok(problems.some((p) => p.includes('gitCommit')), 'foreign-commit evidence rejected');
  assert.ok(GENERATED_OUTPUT_ROOTS.includes('release/'));
});

// ── 22. Choice-set conditional analysis ────────────────────────
// A 90% marginal pick rate is uninterpretable without knowing what else was
// legal. Conditional analysis must distinguish "only option" from
// "preferred over jointly-legal alternatives" using the same decision frames.
test('choice-set conditional metrics use simultaneously legal alternatives', async () => {
  const { buildChoiceAnalysis } = await import('@intrilex/analytics/choice-analysis');
  const mk = (sel, legal, i) => ({
    matchId: `M${i}`, decisionIndex: 0, participantId: 'P1', seat: 1,
    profileId: 'core-advanced-authority', policyId: 'anchor-bias',
    selectedOption: sel, selectedTags: [sel], legalActions: legal,
  });
  // Case A: entity legal alone (with a non-mechanic fallback option only) —
  // every offer is a forced pick; conditionalRate 1.0 carries no preference.
  const soloLegal = [{ family: 'anchor', mode: 'ace-anchor' }, { family: 'phase', mode: 'enter-action' }];
  const alone = [...Array(9)].map((_, i) => mk('ace-anchor', soloLegal, i));
  // Case B: entity legal alongside two other mechanic options — 9/10 picks is
  // a real conditional preference over jointly-legal alternatives.
  const contested = [{ family: 'anchor', mode: 'ace-anchor' }, { family: 'anchor', mode: 'ace-points' }, { family: 'scuttle', mode: 'sea' }];
  const shared = [...Array(9)].map((_, i) => mk('ace-anchor', contested, 100 + i)).concat([mk('ace-points', contested, 200)]);
  const out = buildChoiceAnalysis([...alone, ...shared], { minFrames: 1 });
  const a = out.entities['ace-anchor'];
  assert.equal(a.offeredCount, 19);
  assert.equal(a.selectedCount, 18);
  const vsPoints = a.pairwise.find((p) => p.versus === 'ace-points');
  assert.equal(vsPoints.jointFrames, 10, 'joint legality recorded only when both were offered');
  assert.equal(vsPoints.entitySelected, 9);
  assert.equal(vsPoints.otherSelected, 1);
  assert.equal(vsPoints.conditionalShare, 0.9);
  // The two contexts are distinct and never pooled
  assert.equal(out.contexts.length, 2);
  assert.ok(out.contexts.every((c) => c.offeredOptions.includes('ace-anchor') !== undefined));
  const soloCtx = out.contexts.find((c) => c.offeredOptions.length === 2);
  const contestCtx = out.contexts.find((c) => c.offeredOptions.length === 3);
  assert.equal(soloCtx.dominantShare, 1);
  assert.equal(contestCtx.dominantShare, 0.9);
  assert.equal(contestCtx.normalizedEntropy > 0, true, 'real competition has nonzero entropy');
});

// ── 23. Profile decision diversity / choice entropy ────────────
test('choice entropy matches known fixtures: deterministic 0, uniform 1, no cross-context pooling', async () => {
  const { buildChoiceAnalysis } = await import('@intrilex/analytics/choice-analysis');
  const L3 = [{ family: 'f', mode: 'a' }, { family: 'g', mode: 'b' }, { family: 'h', mode: 'c' }];
  const L4 = [...L3, { family: 'i', mode: 'd' }];
  const mk = (sel, legal, i, pol = 'p1') => ({
    matchId: `E${i}`, decisionIndex: i, participantId: 'P1', seat: 1,
    profileId: 'p', policyId: pol, selectedOption: sel, selectedTags: [sel], legalActions: legal,
  });
  // deterministic: always 'a' -> entropy 0, normalized 0, dominantShare 1
  const det = buildChoiceAnalysis([...Array(8)].map((_, i) => mk('a', L4, i)), { minFrames: 1 });
  const detCtx = det.contexts[0];
  assert.equal(detCtx.choiceEntropyBits, 0);
  assert.equal(detCtx.normalizedEntropy, 0);
  assert.equal(detCtx.dominantShare, 1);
  assert.equal(detCtx.distinctOptionsSelected, 1);
  // uniform over 4 options -> H = 2 bits, normalized 1
  const uni = buildChoiceAnalysis([...Array(8)].map((_, i) => mk(['a', 'b', 'c', 'd'][i % 4], L4, i)), { minFrames: 1 });
  const uniCtx = uni.contexts[0];
  assert.ok(Math.abs(uniCtx.choiceEntropyBits - 2) < 1e-9);
  assert.ok(Math.abs(uniCtx.normalizedEntropy - 1) < 1e-9);
  assert.equal(uniCtx.dominantShare, 0.25);
  // intermediate: 6×a,1×b,1×c over 3 options -> H≈1.252, normalized≈0.79
  const mid = buildChoiceAnalysis([...Array(6)].map((_, i) => mk('a', L3, i))
    .concat([mk('b', L3, 100), mk('c', L3, 101)]), { minFrames: 1 });
  const midCtx = mid.contexts[0];
  const expectedH = -(0.75 * Math.log2(0.75) + 0.125 * Math.log2(0.125) + 0.125 * Math.log2(0.125));
  assert.ok(Math.abs(midCtx.choiceEntropyBits - expectedH) < 1e-9);
  assert.ok(Math.abs(midCtx.normalizedEntropy - expectedH / Math.log2(3)) < 1e-9);
  assert.equal(midCtx.dominantShare, 0.75);
  // different legal sets must never be pooled into one context
  const mixed = buildChoiceAnalysis([mk('a', L3, 1), mk('a', L4, 2), mk('a', L3, 3)], { minFrames: 1 });
  assert.equal(mixed.contexts.length, 2, 'different offered sets stay separate');
  assert.equal(mixed.contexts.every((c) => c.frameCount >= 1), true);
  // single-option contexts report normalizedEntropy 0, not NaN/null-spam
  const single = buildChoiceAnalysis([mk('a', [{ family: 'f', mode: 'a' }], 1)], { minFrames: 1 });
  assert.equal(single.contexts[0].normalizedEntropy, 0);
});

// ── 24. Post-exclusion effective-N gate ────────────────────────
test('raw N above threshold but post-exclusion effective N below threshold → rejected, both Ns disclosed', () => {
  // Two strata: a large stratum whose A-only cohort is completely separated
  // (all wins → OUTCOME_SEPARATION → the whole stratum is excluded), and a
  // small clean stratum. The raw pre-exclusion cohort total (450) clears the
  // 200 minimumEffectiveN, but the estimator's contributing N (120) does not.
  const rows = [];
  let i = 0;
  // BIG stratum (seatOrder P1,P2): aOnly 200-0 separated; the rest mixed.
  for (let k = 0; k < 200; k++) rows.push(row(i++, true, false, true));
  for (let k = 0; k < 60; k++) rows.push(row(i++, true, true, k % 2 === 0));
  for (let k = 0; k < 60; k++) rows.push(row(i++, false, true, k % 2 === 0));
  for (let k = 0; k < 60; k++) rows.push(row(i++, false, false, k % 2 === 0));
  // SMALL stratum (seatOrder P2,P1): clean, 120 decisive rows.
  for (let k = 0; k < 120; k++) {
    const a = k % 4 === 0 || k % 4 === 3, b = k % 4 === 2 || k % 4 === 3;
    const unit = row(i++, a, b, k % 3 !== 0);
    unit.seatOrder = ['P2', 'P1'];
    rows.push(unit);
  }
  const out = analyzeSynergies(rows, { includeDiagnostics: true, minimumBoth: 10, minimumCohort: 10, minimumEffectiveN: 200 });
  assert.equal(out.find((s) => s.id === 'A::B'), undefined, 'the pair must not be admitted as evidence');
  const rejected = (out.diagnostics ?? []).find((d) => d.id === 'A::B' && d.status === 'rejected');
  assert.ok(rejected, 'rejection must be preserved in diagnostics');
  assert.equal(rejected.reasonCode, 'INSUFFICIENT_EFFECTIVE_N');
  assert.ok(rejected.rawN >= 200, `raw cohort N ${rejected.rawN} passed the pre-check`);
  assert.ok(rejected.effectiveN < 200, `post-exclusion effective N ${rejected.effectiveN} below threshold`);
  assert.ok(rejected.excludedN > 0, 'excluded mass is disclosed');
  assert.ok(Array.isArray(rejected.excludedStrata) && rejected.excludedStrata.length === 1);
});
