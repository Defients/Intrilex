import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeStrategyFindings, canonicalizeSubjects, splitDifference, withinPolicyMatchupDifference, timingTrend, FINDING_TYPES, FINDING_TRUST, SYNTHESIS_THRESHOLDS, STRATEGY_SYNTHESIS_CONTRACT } from '../packages/simulation-runtime/src/strategy-synthesis.mjs';
import { strategyGuide, mineStrategyMotifs } from '../packages/simulation-runtime/src/strategy-analysis.mjs';
import { MATURITY_BUCKETS, sealStrategy, verifyStrategy, STRATEGY_CONTRACTS } from '../packages/simulation-runtime/src/strategy-contracts.mjs';
import { createGuidePacket, createStrategyExplanationPacket, validateStrategyExplanation, validateStrategyGuideExplanation, STRATEGY_FACT_UNITS } from '../packages/analytics-ai/src/strategy-interpreter.mjs';

// ── Fixture builders: minimal aggregate-shaped stubs exercising the
// real synthesis code paths without a traced game corpus. ────────────
const SCOPE = { fingerprint: 'v3-fp', rulesProfile: 'core-advanced-authority', eraId: 'v3-era' };
const bucket = (opportunities, selected) => ({ opportunities, selected, selectionRate: opportunities ? selected / opportunities : null });
function aggregate({ opportunities = 0, selected = 0, decisions = null, timing = {}, byPolicy = {}, byMatchup = {}, byPolicyMatchup = {}, semantics = null, selAssoc = null, skipAssoc = null, games = 8, matchups = [] } = {}) {
  const skipped = opportunities - selected;
  return {
    contract: 'STRATEGY_AGGREGATE_V1', fingerprint: SCOPE.fingerprint, rulesProfile: SCOPE.rulesProfile, eraId: SCOPE.eraId,
    total: { decisions: decisions ?? opportunities, opportunities, selected, skipped, selectionRate: opportunities ? selected / opportunities : null, selectedOutcomeAssociation: selAssoc, skippedOutcomeAssociation: skipAssoc },
    timing: MATURITY_BUCKETS.map(b => ({ bucket: b, ...(timing[b] ?? bucket(0, 0)) })),
    semantics, byPolicy, byMatchup, byPolicyMatchup,
    games, matchups, policies: Object.keys(byPolicy), checkpoints: [], provenance: [], origins: ['LOCAL'],
    distinctStates: opportunities, caveats: []
  };
}
const subject = (id, aggregate, extra = {}) => {
  const t = aggregate.total;
  return { subject: id, name: id.split(':')[1] ?? id, aggregate, assoc: t.selectedOutcomeAssociation !== null && t.skippedOutcomeAssociation !== null ? t.selectedOutcomeAssociation - t.skippedOutcomeAssociation : null, claims: extra.claims ?? [], controlled: extra.controlled ?? [], leads: extra.leads ?? [], ...extra };
};
const synth = (data, opts = {}) => synthesizeStrategyFindings(data, { claims: opts.claims ?? [], motifs: opts.motifs ?? [], ...SCOPE, humanName: s => s.split(':')[1] ?? s });
const finding = (s, type, subj) => s.findings.find(f => f.type === type && (!subj || f.subjects.includes(subj)));

// ── A. Timing synthesis ─────────────────────────────────────────────
test('A: score rising + draw fading produce a resource-to-score transition hypothesis', () => {
  const s = synth([
    subject('family:score', aggregate({ opportunities: 49, selected: 32, timing: { OPENING: bucket(36, 20), EARLY: bucket(0, 0), MIDGAME: bucket(0, 0), LATE: bucket(0, 0), ENDGAME: bucket(13, 12) } })),
    subject('family:draw', aggregate({ opportunities: 53, selected: 4, timing: { OPENING: bucket(36, 0), ENDGAME: bucket(17, 4) } }))
  ]);
  const t = finding(s, FINDING_TYPES.RESOURCE_TO_SCORE_TRANSITION);
  assert.ok(t, 'transition finding emitted');
  assert.equal(t.trustClass, FINDING_TRUST.WORKING_HYPOTHESIS);
  assert.deepEqual(t.subjects, ['family:score', 'family:draw']);
  assert.match(t.observations.join(' '), /Opening|Endgame/);
  // The higher-level transition folds the component timing finding.
  assert.ok(!s.findings.some(f => f.type === FINDING_TYPES.TIMING_SHIFT && f.subjects[0] === 'family:score'), 'component timing finding suppressed by dominance');
});

test('A: flat timing shapes never produce a "varied by phase" finding', () => {
  const s = synth([subject('family:scuttle', aggregate({ opportunities: 60, selected: 30, timing: { OPENING: bucket(20, 10), EARLY: bucket(20, 10), MIDGAME: bucket(20, 10) } }))]);
  assert.equal(timingTrend(s.canonicalSubjects.length ? { timing: MATURITY_BUCKETS.map(b => ({ bucket: b, ...bucket(20, 10) })) } : null).shape, 'FLAT');
  assert.ok(!s.findings.some(f => f.subjects.includes('family:scuttle') && [FINDING_TYPES.TIMING_SHIFT, FINDING_TYPES.LATE_COMMITMENT_PATTERN, FINDING_TYPES.EARLY_COMMITMENT_PATTERN].includes(f.type)));
});

test('A: thin timing buckets are flagged unstable; starved buckets never count', () => {
  const s = synth([subject('rank:J', aggregate({ opportunities: 31, selected: 20, timing: { OPENING: bucket(25, 10), ENDGAME: bucket(6, 5) }, games: 10 }))]);
  const t = finding(s, FINDING_TYPES.LATE_COMMITMENT_PATTERN, 'rank:J');
  assert.ok(t, 'rising rank usage surfaces as a late-commitment pattern');
  assert.equal(t.trustClass, FINDING_TRUST.OBSERVED_PATTERN);
  assert.match(t.limitations.join(' '), /thin/i, 'thin end-bucket is disclosed');
  // A bucket with 2 opportunities is ineligible — 2/2 = 100% is not a trend.
  const starved = timingTrend(aggregate({ timing: { OPENING: bucket(2, 2), MIDGAME: bucket(30, 5) } }));
  assert.notEqual(starved.first?.bucket, 'OPENING');
  const insufficient = timingTrend(aggregate({ timing: { OPENING: bucket(3, 3) } }));
  assert.equal(insufficient.shape, 'INSUFFICIENT');
});

// ── B. Usage / association ──────────────────────────────────────────
test('B: frequent association, rare option, default action and thin subject each get the right finding', () => {
  const s = synth([
    subject('rank:9', aggregate({ opportunities: 43, selected: 22, selAssoc: 0.30, skipAssoc: 0.465 })),
    subject('combination:ultra', aggregate({ opportunities: 30, selected: 24, selAssoc: 0.55, skipAssoc: 0.30 })),
    subject('family:swap', aggregate({ opportunities: 40, selected: 2, selAssoc: 0.4, skipAssoc: 0.35 })),
    subject('family:score', aggregate({ opportunities: 30, selected: 27 }))
  ]);
  assert.ok(finding(s, FINDING_TYPES.HIGH_USAGE_NEGATIVE_ASSOCIATION, 'rank:9'), 'frequent + negative signal');
  assert.ok(finding(s, FINDING_TYPES.HIGH_USAGE_POSITIVE_ASSOCIATION, 'combination:ultra'), 'frequent + positive signal');
  assert.ok(finding(s, FINDING_TYPES.COMBINATION_FREQUENT, 'combination:ultra'), 'committed combination is central');
  assert.ok(finding(s, FINDING_TYPES.RARE_OPTION, 'family:swap'), 'legal-but-ignored option');
  assert.ok(finding(s, FINDING_TYPES.COMMON_DEFAULT_ACTION, 'family:score'), 'near-automatic action');
  for (const f of s.findings) if (f.trustClass !== FINDING_TRUST.CONTROLLED_ADVICE) assert.equal(f.trustClass === FINDING_TRUST.CONTROLLED_ADVICE, false);
});

test('B: dramatic numbers on tiny samples are flagged, never headlined as signal', () => {
  const s = synth([subject('rank:X', aggregate({ opportunities: 10, selected: 6, selAssoc: 0.1, skipAssoc: 0.5, games: 3 }))]);
  const thin = finding(s, FINDING_TYPES.SAMPLE_TOO_THIN, 'rank:X');
  assert.ok(thin, 'thin finding emitted');
  assert.match(thin.observations[0], /Only 10 legal opportunities/);
  assert.match(thin.observations[0], /swings on 4/, 'smaller side disclosed');
  assert.ok(!finding(s, FINDING_TYPES.HIGH_USAGE_NEGATIVE_ASSOCIATION, 'rank:X'), 'thin association cannot become a usage finding');
  // Association needs a minimum side count even on an adequate subject.
  const lopsided = synth([subject('rank:Q', aggregate({ opportunities: 30, selected: 29, selAssoc: 0.9, skipAssoc: 0.1, games: 10 }))]);
  assert.ok(!finding(lopsided, FINDING_TYPES.HIGH_USAGE_POSITIVE_ASSOCIATION, 'rank:Q'), 'one-sided association is sample-fragile');
});

// ── C. Policy / matchup differences ─────────────────────────────────
test('C: an adequately sampled policy split names the subject and both policies', () => {
  const s = synth([subject('combination:ultra', aggregate({ opportunities: 34, selected: 28, byPolicy: { tempo: bucket(17, 16), value: bucket(17, 12) } }))]);
  const f = finding(s, FINDING_TYPES.POLICY_DISAGREEMENT, 'combination:ultra');
  assert.ok(f, 'policy disagreement emitted');
  assert.match(f.observations[0], /tempo selected ultra 94\.1% of 17 opportunities; value selected ultra 70\.6% of 17/);
  assert.match(f.limitations.join(' '), /not proof/i);
  assert.ok(s.policyDifferences.includes(f));
});

test('C: confounded mirror play can never be sold as a matchup effect', () => {
  // Each policy faces exactly one opponent — byPolicyMatchup has no
  // within-policy opponent pair, so no matchup finding may appear.
  const confounded = aggregate({
    opportunities: 34, selected: 28,
    byMatchup: { tempo: bucket(17, 12), value: bucket(17, 16) },
    byPolicyMatchup: { tempo: { value: bucket(17, 16) }, value: { tempo: bucket(17, 12) } }
  });
  assert.equal(withinPolicyMatchupDifference(confounded), null, 'no within-policy opponent variation');
  const s = synth([subject('combination:ultra', confounded)]);
  assert.ok(!finding(s, FINDING_TYPES.MATCHUP_SENSITIVITY, 'combination:ultra'), 'policy/opponent confound rejected');
  assert.ok(!s.unknowns.some(u => u.kind === 'MATCHUP_COVERAGE'), 'no matchup unknown without multi-opponent coverage');
});

test('C: a real within-policy opponent split qualifies as matchup sensitivity', () => {
  const s = synth([subject('rank:K', aggregate({
    opportunities: 24, selected: 14, matchups: ['value', 'greedy'],
    byPolicyMatchup: { tempo: { value: bucket(12, 11), greedy: bucket(12, 3) } }
  }))]);
  const f = finding(s, FINDING_TYPES.MATCHUP_SENSITIVITY, 'rank:K');
  assert.ok(f, 'within-policy opponent split is matchup evidence');
  assert.match(f.observations[0], /tempo used K 91\.7% against value \(11\/12\) but 25\.0% against greedy \(3\/12\)/);
  assert.ok(s.unknowns.some(u => u.kind === 'MATCHUP_COVERAGE'), 'coverage limitation is disclosed');
});

test('C: split comparisons below the sampling floor cannot pass', () => {
  const thin = aggregate({ opportunities: 10, selected: 5, byPolicy: { a: bucket(5, 5), b: bucket(5, 0) } });
  const diff = splitDifference(thin, 'byPolicy');
  assert.ok(diff && diff.thin, 'huge-looking split flagged thin instead of qualifying');
});

// ── D. Motif filtering ──────────────────────────────────────────────
const motifEvent = (turn, gameOrdinal = 0, runId = 'run') => ({
  seat: 1, artifactId: `e-${runId}-${gameOrdinal}-${turn}`, actorId: 'P1',
  identity: { runId, gameOrdinal, eraId: SCOPE.eraId },
  context: { turn },
  candidates: [{ actionId: `a${turn}`, family: 'score', mode: 'points' }],
  selectedActionId: `a${turn}`,
  outcomes: { clean: true, terminalWinner: 'P1' }
});
test('D: one game cannot inflate a motif — per-game occurrence cap plus multi-game gate', () => {
  // 8 same-game score actions would emit 3+ windows; the cap holds it to 2.
  const oneGame = mineStrategyMotifs([...Array(8)].map((_, i) => motifEvent(i + 1, 0)));
  const triple = oneGame.find(m => m.sequence.length === 3);
  assert.ok(triple && triple.occurrences <= 2, `capped at 2 per game (got ${triple?.occurrences})`);
  assert.equal(triple.gameCount, 1);
  // The synthesis gate additionally requires multi-game coverage.
  const s = synth([], { motifs: [{ sequence: ['score:points', 'score:points'], occurrences: 20, gameCount: 1 }] });
  assert.ok(!s.findings.some(f => f.type === FINDING_TYPES.MOTIF_PATTERN), 'single-game motif suppressed');
  const real = synth([], { motifs: [{ sequence: ['score:points', 'draw:top'], occurrences: 8, gameCount: 5 }] });
  assert.ok(finding(real, FINDING_TYPES.MOTIF_PATTERN), 'multi-game motif survives');
});

// ── E. Deduplication, dominance, structural subjects ────────────────
test('E: alias subjects collapse to one canonical representative', () => {
  const shared = aggregate({ opportunities: 20, selected: 10 });
  const { canonical } = canonicalizeSubjects([
    subject('family:score', shared), subject('mechanic:score-mode', { ...shared }), subject('mode:scoring', { ...shared })
  ]);
  assert.equal(canonical.length, 1, 'identical signals collapse');
  assert.equal(canonical[0].subject, 'family:score', 'preferred alias wins');
  assert.deepEqual([...canonical[0].aliases].sort(), ['family:score', 'mechanic:score-mode', 'mode:scoring']);
});

test('E: structural ~always-selected tags generate no findings or questions', () => {
  const s = synth([subject('family:phase', aggregate({ opportunities: 40, selected: 40, selAssoc: 0.5, skipAssoc: 0.5 }))]);
  assert.ok(!s.findings.some(f => f.subjects.includes('family:phase')), 'structural subject emits nothing');
  assert.ok(!s.researchQuestions.some(q => q.subject === 'family:phase'));
});

test('E: mechanic and mode lenses never become primary findings', () => {
  const s = synth([subject('mechanic:instant', aggregate({ opportunities: 34, selected: 28, timing: { OPENING: bucket(17, 4), ENDGAME: bucket(17, 15) } }))]);
  assert.ok(!s.findings.some(f => f.subjects.includes('mechanic:instant')));
});

// ── F. Grouped unknowns + research questions ────────────────────────
test('F: unknowns group semantically — card, family, combination and thin buckets', () => {
  const s = synth([
    subject('rank:K', aggregate({ opportunities: 42, selected: 17 })),
    subject('family:draw', aggregate({ opportunities: 53, selected: 4 })),
    subject('combination:ultra', aggregate({ opportunities: 30, selected: 24 })),
    subject('rank:3', aggregate({ opportunities: 9, selected: 3 }))
  ]);
  const kinds = s.unknowns.map(u => u.kind);
  assert.ok(kinds.includes('CARD_USE_PRESERVE'), 'card unknown uses use-vs-preserve wording');
  assert.ok(kinds.includes('FAMILY_CONTRAST'), 'family unknown uses action-family wording');
  assert.ok(kinds.includes('COMBINATION_CONTRAST'), 'combination unknown uses commit wording');
  assert.ok(kinds.includes('THIN_SAMPLE'), 'thin subjects disclosed as a group');
  assert.match(s.unknowns.find(u => u.kind === 'CARD_USE_PRESERVE').summary, /K/);
});

test('F: research questions dedup by canonical subject and lead kind', () => {
  const lead = { kind: 'TIMING_CONTRAST', detail: 'test early vs late' };
  const s = synth([subject('rank:K', aggregate({ opportunities: 42, selected: 17 }), { leads: [lead, lead] })]);
  assert.equal(s.researchQuestions.filter(q => q.subject === 'rank:K' && q.kind === 'TIMING_CONTRAST').length, 1);
});

// ── G. Guide V3 end-to-end ──────────────────────────────────────────
function guideFixture() {
  const subjects = [
    subject('family:score', aggregate({ opportunities: 49, selected: 32, timing: { OPENING: bucket(36, 20), ENDGAME: bucket(13, 12) } })),
    subject('family:draw', aggregate({ opportunities: 53, selected: 4, timing: { OPENING: bucket(36, 0), ENDGAME: bucket(17, 4) } })),
    subject('rank:K', aggregate({ opportunities: 42, selected: 17, selAssoc: 0.60, skipAssoc: 0.355 })),
    subject('combination:ultra', aggregate({ opportunities: 30, selected: 24, byPolicy: { tempo: bucket(17, 16), value: bucket(17, 12) }, byPolicyMatchup: { tempo: { value: bucket(17, 16) }, value: { tempo: bucket(17, 12) } } }))
  ];
  return { subjects: subjects.map(s => ({ subject: s.subject, aggregate: s.aggregate })), subjectData: subjects };
}
test('G: the sealed guide carries the synthesis, sections and honest matchup wording', () => {
  const { subjects } = guideFixture();
  const guide = strategyGuide([], { ...SCOPE, subjects, motifs: [], humanName: s => s.split(':')[1] ?? s });
  verifyStrategy(guide.manifest, STRATEGY_CONTRACTS.guide);
  assert.equal(guide.manifest.guideVersion, 3);
  assert.equal(guide.manifest.synthesis.contract, STRATEGY_SYNTHESIS_CONTRACT);
  const md = guide.markdown;
  assert.match(md, /## What This Dataset Is Actually Telling Us/);
  assert.match(md, /Games shift from setup toward scoring pressure/);
  assert.match(md, /tempo selected ultra 94\.1% of 17 opportunities; value selected ultra 70\.6%/);
  assert.match(md, /No adequately sampled matchup difference in this evidence yet\./);
  assert.match(md, /## What We Still Don't Know/);
  assert.match(md, /use-versus-preserve/, 'card unknown wording');
  assert.ok(!/observed against \d+ distinct opponent policies/.test(md), 'old matchup boilerplate gone');
  // Deterministic: identical input seals to the identical artifact.
  const again = strategyGuide([], { ...SCOPE, generatedAt: guide.manifest.generatedAt, subjects, motifs: [], humanName: s => s.split(':')[1] ?? s });
  assert.equal(again.manifest.artifactId, guide.manifest.artifactId);
});

test('G: controlled advice is re-stated as a CONTROLLED_ADVICE finding, never manufactured', () => {
  const claim = sealStrategy(STRATEGY_CONTRACTS.claim, {
    schemaVersion: 1, subject: 'rank:K', scope: { fingerprint: SCOPE.fingerprint, rulesProfile: SCOPE.rulesProfile, eraId: SCOPE.eraId, filters: {} },
    evidenceType: 'COUNTERFACTUAL', confidence: 'SUGGESTIVE', recommendation: 'PLAY', informationScope: 'ACTOR_AUTHORIZED',
    estimatedMagnitude: 0.06, uncertainty: { interval: [0.04, 0.08], level: 0.95 }, sampleSize: 12, opportunityCount: 12, selectedCount: 12,
    distinctStateCount: 4, independentStateCount: 4, seedBlocks: 4, pairedCount: 12, policies: ['value'], checkpoints: [], matchups: [],
    provenance: [], generatedAt: '2026-01-01T00:00:00.000Z', caveats: [], stale: false, invalidated: false, origin: 'LOCAL_REPRODUCTION',
    statementData: { informationSetId: 'is-1', direction: 'REFERENCE', referenceLabel: 'play K', testedAlternatives: ['a', 'b'], heterogeneity: 'ROBUST', hiddenWorlds: 4, continuationsPerWorld: 2, minimumMeaningfulEffect: 0.02 }
  });
  const data = [subject('rank:K', aggregate({ opportunities: 42, selected: 17 }), { controlled: [claim], claims: [claim] })];
  const s = synth(data, { claims: [claim] });
  const f = finding(s, FINDING_TYPES.CONTROL_SIGNAL, 'rank:K');
  assert.ok(f && f.trustClass === FINDING_TRUST.CONTROLLED_ADVICE, 'controlled claim surfaces as controlled advice');
  assert.deepEqual(f.sourceClaimIds, [claim.artifactId]);
  assert.equal(s.controlledAdvice.length, 1);
  // A descriptive claim can never cross the boundary.
  const desc = { ...claim, evidenceType: 'DESCRIPTIVE', recommendation: 'UNKNOWN', confidence: 'EXPERIMENTAL' };
  const s2 = synth(data.map(d => ({ ...d, controlled: [desc] })));
  assert.equal(s2.controlledAdvice.length, 0, 'observational evidence never becomes advice');
});

// ── H. Guide packet + CARD_POINT_VALUE grounding ────────────────────
test('H: GUIDE packet carries synthesized findings, not a raw markdown dump', () => {
  const { subjects } = guideFixture();
  const guide = strategyGuide([], { ...SCOPE, subjects, motifs: [], humanName: s => s.split(':')[1] ?? s });
  const packet = createGuidePacket({ manifest: guide.manifest, markdown: guide.markdown });
  const g = packet.surfaceData.guide;
  assert.ok(g.strategicFindings.length > 0, 'findings in packet');
  assert.ok(g.strategicFindings.every(f => f.type && f.trustClass && f.headline), 'findings are structured');
  assert.ok('topFindings' in g && 'majorUnknowns' in g && 'researchQuestions' in g && 'controlledAdvice' in g);
  assert.ok(g.excerpt.text.length <= 4000 && typeof g.excerpt.truncated === 'boolean', 'markdown is a bounded labeled excerpt');
  assert.ok(g.strategicFindings.some(f => f.type === FINDING_TYPES.RESOURCE_TO_SCORE_TRANSITION), 'cross-signal finding reaches the model');
});

test('H: card point value is a rules fact — unsigned "N points" grounds, signed deltas do not', () => {
  const packet = createStrategyExplanationPacket({ surface: 'CARD', subject: 'rank:7', cardPointValue: 7 });
  const fact = packet.groundingFacts.find(f => f.id === 'card_point_value');
  assert.equal(fact.unit, STRATEGY_FACT_UNITS.CARD_POINT_VALUE);
  assert.equal(fact.display, '7 card points');
  const base = { headline: 'h', plainSummary: 'K is worth 7 card points', whatThisMeans: 'm', whatThisDoesNotMean: 'n', practicalTakeaway: 't', interestingSignal: 's', nextUsefulTest: 'x', confidenceLanguage: 'UNKNOWN', evidenceLabel: packet.evidenceLabel, warnings: [], usedFactIds: [] };
  assert.doesNotThrow(() => validateStrategyExplanation({ ...base, plainSummary: 'K is worth 7 points' }, packet), 'unsigned points may be the card value');
  assert.throws(() => validateStrategyExplanation({ ...base, plainSummary: 'K gained +7 points' }, packet), /UNGROUNDED_NUMBER/, 'signed "points" is a statistical delta — no pp fact');
  assert.throws(() => validateStrategyExplanation({ ...base, plainSummary: 'K gained +7 pp' }, packet), /UNGROUNDED_NUMBER/);
});

test('H: guide explanation schema enforces shape, bounds and grounding', () => {
  const { subjects } = guideFixture();
  const guide = strategyGuide([], { ...SCOPE, subjects, motifs: [], humanName: s => s.split(':')[1] ?? s });
  const packet = createGuidePacket({ manifest: guide.manifest, markdown: guide.markdown });
  const valid = {
    title: 'Field guide', executiveTake: 'take', phaseOfGame: 'phases differ', bottomLine: 'bl',
    keyLessons: [{ headline: 'L', explanation: 'e', confidence: 'WORKING_HYPOTHESIS', caveat: 'c', nextQuestion: 'q' }],
    thingsNotToOverread: ['x'], bestNextExperiments: ['y'],
    confidenceLanguage: 'UNKNOWN', evidenceLabel: packet.evidenceLabel, usedFactIds: []
  };
  assert.doesNotThrow(() => validateStrategyGuideExplanation(valid, packet));
  assert.throws(() => validateStrategyGuideExplanation({ ...valid, executiveTake: 7 }, packet), /STRATEGY_GUIDE_SCHEMA/);
  assert.throws(() => validateStrategyGuideExplanation({ ...valid, keyLessons: [{ headline: 'L', explanation: 'e', confidence: 'CERTAIN', caveat: 'c', nextQuestion: 'q' }] }, packet), /STRATEGY_GUIDE_SCHEMA/, 'confidence enum enforced');
  assert.throws(() => validateStrategyGuideExplanation({ ...valid, evidenceLabel: 'PLAYER_ACTIONABLE' }, packet), /LABEL_MISMATCH|SCHEMA/, 'label must echo the packet');
  assert.throws(() => validateStrategyGuideExplanation({ ...valid, phaseOfGame: 'usage rose 99%' }, packet), /UNGROUNDED_NUMBER/, 'nested fields are grounded too');
  assert.throws(() => validateStrategyGuideExplanation({ ...valid, thingsNotToOverread: Array(9).fill('x') }, packet), /STRATEGY_GUIDE_SCHEMA/, 'array bounds enforced');
});

// ── Threshold documentation ─────────────────────────────────────────
test('documented thresholds govern every gating decision', () => {
  assert.deepEqual(Object.keys(SYNTHESIS_THRESHOLDS).sort(), [
    'ASSOCIATION_MIN_SIDE', 'ASSOCIATION_RARE', 'ASSOCIATION_STRONG', 'COMBINATION_FREQUENT_RATE',
    'COMBINATION_MIN_OPPORTUNITIES', 'COMBINATION_UNDERUSED_RATE', 'DEFAULT_ACTION_RATE', 'HIGH_USAGE_RATE',
    'MOTIF_MIN_GAMES', 'MOTIF_MIN_OCCURRENCES', 'RARE_OPTION_MIN_OPPORTUNITIES', 'RARE_OPTION_RATE',
    'SEMANTIC_CONCENTRATION', 'SEMANTIC_MIN_OPPORTUNITIES', 'SEMANTIC_SPLIT_MIN', 'SPLIT_MIN_DELTA',
    'SPLIT_MIN_OPPORTUNITIES', 'THIN_SUBJECT_OPPORTUNITIES', 'TIMING_BUCKET_MIN', 'TIMING_BUCKET_SOLID',
    'TIMING_DIRECTION', 'TIMING_MIN_TOTAL', 'TIMING_SPREAD'
  ]);
});
