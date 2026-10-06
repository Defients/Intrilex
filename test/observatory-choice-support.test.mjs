// Choice-support / preference-identification contracts.
// Regression coverage for the Voltage Observatory finding: a pick rate near
// 1.0 with almost no legal-but-unselected support is a descriptive
// regularity, not identified preference — and "jointly legal" tags that only
// ever appeared on the SAME action (family + mode) are not substitutable
// rivals. These tests pin those semantics at the analytics layer, the
// browser-parity layer, the deterministic-checks layer, and the UI source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildMechanicsAtlas } from '@intrilex/analytics';
import { buildChoiceAnalysis } from '@intrilex/analytics/choice-analysis';
import { choiceSupportStatus, CHOICE_SUPPORT_MIN_DECLINES } from '@intrilex/analytics/observatory-integrity';
import { runDeterministicChecks, DET_CHECK } from '@intrilex/analytics-ai/deterministic-statistics';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/lab-web/dist');
const distModule = (rel) => import(pathToFileURL(path.join(dist, rel)).href);

// ── Fixtures ───────────────────────────────────────────────────
// Decision records in the buildChoiceAnalysis input shape.
const decision = (sel, legal, i, tags = [sel]) => ({
  matchId: `M${Math.floor(i / 10)}`, decisionIndex: i, participantId: 'P1', seat: 1,
  profileId: 'core-advanced-authority', policyId: 'p',
  selectedOption: sel, selectedTags: tags, legalActions: legal,
});

// A Start-phase-like frame: several voltage variants + a non-mechanic
// fallback (mirrors voltage enumeration in core-autonomy.js).
const VOLTAGE_FRAME = [
  { family: 'voltage', mode: 'three-hand' },
  { family: 'voltage', mode: 'three-points' },
  { family: 'voltage', mode: 'five-gy-bottom' },
  { family: 'voltage', mode: 'five-refine' },
  { family: 'voltage', mode: 'four-guess-rj-clubs' },
  { family: 'swap-bar', mode: 'face-ace' },
  { family: 'phase', mode: 'enter-action' },
];
const TAGS = {
  'five-gy-bottom': ['five-gy-bottom', 'voltage'],
  'five-refine': ['five-refine', 'voltage'],
  'three-hand': ['three-hand', 'voltage'],
  'face-ace': ['face-ace', 'swap-bar'],
  'phase:enter-action': [],
};

const matchSummary = (i, mech, sel, opp, p1Won) => ({
  matchId: `M${i}`, matchResultHash: String(i).padStart(64, '0'), profileId: 'core-advanced-authority',
  winner: p1Won ? 'P1' : 'P2', terminationReason: 'NORMAL_VICTORY', completedFullTurns: 10,
  participants: [
    { participantId: 'P1', policyId: 'control', seat: 1, result: p1Won ? 'win' : 'loss', mechanicCounts: { [mech]: sel }, mechanicOpportunityCounts: { [mech]: opp } },
    { participantId: 'P2', policyId: 'value', seat: 2, result: p1Won ? 'loss' : 'win', mechanicCounts: {}, mechanicOpportunityCounts: {} },
  ],
});

// ── 1. Same-action tag pairs are not substitutable rivals ──────
test('family vs mode of the same action is classified same-action-only, not an independent rival', () => {
  // 10 frames: voltage always selected via the five-gy-bottom action.
  const decisions = [...Array(10)].map((_, i) => decision('five-gy-bottom', VOLTAGE_FRAME, i, TAGS['five-gy-bottom']));
  const out = buildChoiceAnalysis(decisions, { minFrames: 1 });
  const voltage = out.entities['voltage'];
  const vsMode = voltage.pairwise.find((p) => p.versus === 'five-gy-bottom');
  assert.equal(vsMode.jointFrames, 10);
  assert.equal(vsMode.rivalOptionFrames, 0, 'five-gy-bottom never existed without the voltage tag');
  assert.equal(vsMode.relation, 'same-action-only');
  assert.equal(vsMode.otherSelected, 0);
  assert.equal(vsMode.conditionalShare, 1, 'the 1.0 share is structural, kept as raw statistic');
  // The reverse direction: voltage WAS independently selectable.
  const mode = out.entities['five-gy-bottom'];
  const vsFamily = mode.pairwise.find((p) => p.versus === 'voltage');
  assert.equal(vsFamily.relation, 'independent-rival', 'the family tag had other variants offered alongside');
  assert.ok(vsFamily.rivalOptionFrames > 0);
});

// ── 2. Distinct variants of one family remain genuine rivals ───
test('distinct voltage modes selected against each other keep independent-rival accounting', () => {
  const decisions = [];
  // 6 picks of five-gy-bottom, 4 picks of three-hand, all in the same frame.
  for (let i = 0; i < 6; i += 1) decisions.push(decision('five-gy-bottom', VOLTAGE_FRAME, i, TAGS['five-gy-bottom']));
  for (let i = 0; i < 4; i += 1) decisions.push(decision('three-hand', VOLTAGE_FRAME, 10 + i, TAGS['three-hand']));
  const out = buildChoiceAnalysis(decisions, { minFrames: 1 });
  const gy = out.entities['five-gy-bottom'];
  const vsHand = gy.pairwise.find((p) => p.versus === 'three-hand');
  assert.equal(vsHand.relation, 'independent-rival');
  assert.equal(vsHand.entitySelected, 6);
  assert.equal(vsHand.otherSelected, 4);
  assert.ok(Math.abs(vsHand.conditionalShare - 0.6) < 1e-12, 'share among contested frames only');
  assert.equal(vsHand.neitherSelected, 0);
});

// ── 3. Choice support classification ───────────────────────────
test('choiceSupportStatus: deterministic → unsupported, thin → limited, sufficient → identified', () => {
  assert.equal(choiceSupportStatus(0), 'unsupported');
  assert.equal(choiceSupportStatus(CHOICE_SUPPORT_MIN_DECLINES - 1), 'limited');
  assert.equal(choiceSupportStatus(CHOICE_SUPPORT_MIN_DECLINES), 'identified');
  assert.equal(choiceSupportStatus(null), 'unmeasured');
  assert.equal(choiceSupportStatus(50, false), 'unmeasured');
});

test('near-deterministic selection is Limited, fully deterministic is Unsupported', () => {
  // 26 offered, 25 selected, 1 decline to the non-mechanic fallback.
  const near = [...Array(25)].map((_, i) => decision('five-gy-bottom', VOLTAGE_FRAME, i, TAGS['five-gy-bottom']))
    .concat([decision('phase:enter-action', VOLTAGE_FRAME, 99, TAGS['phase:enter-action'])]);
  const nearOut = buildChoiceAnalysis(near, { minFrames: 1 });
  const v = nearOut.entities['voltage'];
  assert.equal(v.offeredCount, 26);
  assert.equal(v.selectedCount, 25);
  assert.equal(v.declinedCount, 1);
  assert.equal(v.choiceSupport.status, 'limited');
  assert.deepEqual(v.declineOutcomes, { 'phase:enter-action': 1 }, 'decline destination is recorded');

  // Fully deterministic: 10 offered, 10 selected.
  const det = buildChoiceAnalysis([...Array(10)].map((_, i) => decision('five-gy-bottom', VOLTAGE_FRAME, 200 + i, TAGS['five-gy-bottom'])), { minFrames: 1 });
  const dv = det.entities['voltage'];
  assert.equal(dv.declinedCount, 0);
  assert.equal(dv.choiceSupport.status, 'unsupported');
  assert.deepEqual(dv.declineOutcomes, {});
});

// ── 4. Neither accounting preserved ────────────────────────────
test('declining the whole family lands in neither/outcomes, not rival selected', () => {
  const decisions = [...Array(8)].map((_, i) => decision('five-gy-bottom', VOLTAGE_FRAME, i, TAGS['five-gy-bottom']))
    .concat([decision('phase:enter-action', VOLTAGE_FRAME, 8, TAGS['phase:enter-action'])])
    .concat([decision('face-ace', VOLTAGE_FRAME, 9, TAGS['face-ace'])]);
  const out = buildChoiceAnalysis(decisions, { minFrames: 1 });
  const v = out.entities['voltage'];
  const vsGy = v.pairwise.find((p) => p.versus === 'five-gy-bottom');
  // enter-action frame → neither; face-ace frame → neither (gy-bottom tag absent there too)
  assert.equal(vsGy.neitherSelected, 2);
  assert.equal(vsGy.otherSelected, 0);
  assert.equal(v.declinedCount, 2);
  assert.equal(v.declineOutcomes['phase:enter-action'], 1);
  assert.equal(v.declineOutcomes['face-ace'], 1);
});

// ── 5. Ordinary competitive mechanics keep identification ──────
test('genuinely substitutable cross-family pairs remain identified', () => {
  const legal = [{ family: 'score', mode: 'ordinary' }, { family: 'draw', mode: 'ordinary' }, { family: 'scuttle', mode: 'sea' }];
  const decisions = [
    ...[...Array(12)].map((_, i) => decision('score', legal, i)),
    ...[...Array(15)].map((_, i) => decision('draw', legal, 20 + i)),
    ...[...Array(8)].map((_, i) => decision('scuttle', legal, 40 + i)),
  ];
  const out = buildChoiceAnalysis(decisions, { minFrames: 1 });
  const score = out.entities['score'];
  assert.equal(score.declinedCount, 23);
  assert.equal(score.choiceSupport.status, 'identified', 'enough declines to discuss choice behavior');
  const vsDraw = score.pairwise.find((p) => p.versus === 'draw');
  assert.equal(vsDraw.relation, 'independent-rival');
  assert.equal(vsDraw.rivalOptionFrames, 35);
  assert.equal(vsDraw.otherSelected, 15);
  assert.equal(vsDraw.neitherSelected, 8);
  assert.ok(Math.abs(vsDraw.conditionalShare - 12 / 27) < 1e-12);
});

// ── 6. Atlas rows carry support, and association stays valid ───
test('buildMechanicsAtlas exposes legalDeclinedCount + choiceSupport without disturbing association fields', () => {
  // Degenerate pick rate: 60 opportunities, 59 selections across participants.
  const degenerate = [...Array(30)].map((_, i) => matchSummary(i, 'voltage', 2, 2, i % 2 === 0))
    .concat([matchSummary(99, 'voltage', 0, 1, true)]);
  const atlas = buildMechanicsAtlas(degenerate);
  const v = atlas.find((r) => r.mechanic === 'voltage');
  assert.equal(v.selectionCount, 60);
  assert.equal(v.legalOpportunityCount, 61);
  assert.equal(v.legalDeclinedCount, 1);
  assert.equal(v.choiceSupport.status, 'limited');
  assert.ok(v.pickRateWhenLegal > 0.98);
  // The observational association machinery is untouched.
  assert.ok('rawWinAssociation' in v && 'adjustedWinAssociation' in v);
  assert.ok(v.limitations.some((l) => l.includes('not preference evidence')));

  // Fully deterministic: selected in every opportunity.
  const forced = [...Array(10)].map((_, i) => matchSummary(200 + i, 'voltage', 1, 1, i % 3 === 0));
  const detRow = buildMechanicsAtlas(forced).find((r) => r.mechanic === 'voltage');
  assert.equal(detRow.legalDeclinedCount, 0);
  assert.equal(detRow.choiceSupport.status, 'unsupported');

  // Missing telemetry → unmeasured, never a fabricated support verdict.
  const legacy = [...Array(10)].map((_, i) => matchSummary(300 + i, 'voltage', 1, 0, i % 3 === 0));
  const legacyRow = buildMechanicsAtlas(legacy).find((r) => r.mechanic === 'voltage');
  assert.equal(legacyRow.hasOpportunityData, false);
  assert.equal(legacyRow.choiceSupport.status, 'unmeasured');
  assert.equal(legacyRow.legalDeclinedCount, null);
});

test('impossible counts still rejected: legalDeclinedCount can never go negative', () => {
  // Telemetry corruption: selections exceed opportunities (USAGE_VS_OPPORTUNITY
  // catches this downstream) — the support field must clamp, not invent -3 declines.
  const corrupt = [...Array(5)].map((_, i) => matchSummary(400 + i, 'voltage', 3, 1, i % 2 === 0));
  const row = buildMechanicsAtlas(corrupt).find((r) => r.mechanic === 'voltage');
  assert.equal(row.legalDeclinedCount, 0);
  assert.equal(row.choiceSupport.status, 'unsupported');
  const warnings = runDeterministicChecks({ observatory: { mechanics: [row] }, aggregate: { matchCount: 5 } });
  assert.ok(warnings.some((w) => w.check === DET_CHECK.USAGE_VS_OPPORTUNITY), 'impossible counts still flagged');
});

// ── 7. Stratified estimator discloses its support ──────────────
test('adjusted association reports contributing vs skipped strata', () => {
  // Two policies: 'always' uses voltage every match; 'mixed' uses it half the
  // time. The always-stratum has no unused cohort and must be disclosed as
  // skipped, not silently extrapolated.
  const rows = [];
  for (let i = 0; i < 40; i += 1) {
    const p1Won = i % 2 === 0;
    rows.push({
      matchId: `S${i}`, matchResultHash: String(1000 + i).padStart(64, '0'), profileId: 'core-advanced-authority',
      winner: p1Won ? 'P1' : 'P2', terminationReason: 'NORMAL_VICTORY', completedFullTurns: 10,
      participants: [
        { participantId: 'P1', policyId: i < 20 ? 'always' : 'mixed', seat: 1, result: p1Won ? 'win' : 'loss', mechanicCounts: { voltage: 1 }, mechanicOpportunityCounts: { voltage: 2 } },
        { participantId: 'P2', policyId: i < 20 ? 'always' : 'mixed', seat: 2, result: p1Won ? 'loss' : 'win', mechanicCounts: i < 20 ? { voltage: 2 } : { voltage: i % 4 === 0 ? 1 : 0 }, mechanicOpportunityCounts: { voltage: 3 } },
      ],
    });
  }
  const row = buildMechanicsAtlas(rows).find((r) => r.mechanic === 'voltage');
  assert.equal(row.adjustedWinAssociationStatus.status, 'available');
  assert.ok(row.adjustedWinAssociationStatus.contributingStrata >= 1, 'at least the mixed stratum contributes');
  assert.ok(row.adjustedWinAssociationStatus.skippedStrata >= 1, 'the always-policy stratum has no within-stratum comparison and must be disclosed as skipped');
});

// ── 8. Deterministic-checks guard ──────────────────────────────
test('deterministic checks flag degenerate pick rates before the LLM sees them', () => {
  const mechanics = [
    { mechanic: 'voltage', selectionCount: 4345, legalOpportunityCount: 4346, pickRateWhenLegal: 4345 / 4346, legalDeclinedCount: 1 },
    { mechanic: 'score', selectionCount: 553, legalOpportunityCount: 1463, pickRateWhenLegal: 0.378, legalDeclinedCount: 910 },
  ];
  const warnings = runDeterministicChecks({ observatory: { mechanics }, aggregate: { matchCount: 500 } });
  const cs = warnings.filter((w) => w.check === DET_CHECK.CHOICE_SUPPORT);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].title.includes('voltage'), true);
  assert.ok(cs[0].detail.includes('legal-but-unselected'));
});

// ── 9. Browser parity ──────────────────────────────────────────
test('dist shared-analytics carries identical choice-support semantics (when built)', async () => {
  if (!existsSync(path.join(dist, 'shared-analytics/choice-analysis.mjs'))) return;
  const { buildChoiceAnalysis: distBuild } = await distModule('shared-analytics/choice-analysis.mjs');
  const { choiceSupportStatus: distStatus } = await distModule('shared-analytics/observatory-integrity.mjs');
  const decisions = [...Array(10)].map((_, i) => decision('five-gy-bottom', VOLTAGE_FRAME, i, TAGS['five-gy-bottom']));
  const out = distBuild(decisions, { minFrames: 1 });
  assert.equal(out.entities['voltage'].pairwise.find((p) => p.versus === 'five-gy-bottom').relation, 'same-action-only');
  assert.equal(out.entities['voltage'].choiceSupport.status, 'unsupported');
  assert.equal(distStatus(0), 'unsupported');
});

// ── 10. UI source contracts ────────────────────────────────────
test('Mechanics page surfaces choice support, decline targets, and structural-pair marking', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/workspaces/observatory.js'), 'utf8');
  assert.ok(src.includes('Legal-but-unselected'), 'detail page shows the legal-but-unselected count');
  assert.ok(src.includes('Choice support'), 'detail page shows the choice-support dimension');
  assert.ok(src.includes('choice-support-warning'), 'degenerate mechanics get an explicit warning notice');
  assert.ok(src.includes('Rival independently selectable'), 'pair table separates joint legality from substitutability');
  assert.ok(src.includes('independently selectable option'), 'structural shares carry a structural note');
  assert.ok(src.includes('association evidence grade') || src.includes('Association evidence grade'), 'evidence badge is scoped to association quality');
});
