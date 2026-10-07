// experiment-integrity.test.mjs — regression coverage for the experimental-
// integrity repair: true AB/BA policy↔seat reversal, fail-closed pair
// verification, aggregate paired inference, the integrity dashboard, combo
// reconciliation, taxonomy coverage, and deep-tracing gameplay neutrality.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runCampaign } from '@intrilex/simulation-runtime/campaign';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { buildPairedABBAAnalysis, verifyPairBlock, PAIR_BLOCK_REASON } from '@intrilex/analytics/paired-abba';
import { buildExperimentIntegrity } from '@intrilex/analytics/experiment-integrity';
import { buildComboAtlas } from '@intrilex/analytics/combo-analytics';
import { mcnemarPairedTest, binomialSignTest } from '@intrilex/statistics/paired-tests';
import { taxonomyCoverage, quarantineUnknownTags } from '@intrilex/decision-intelligence';

// ── Summary stub factory (analytics contract, not engine) ──────────────────
const stubRow = (i, { policyIds = ['control', 'value'], seatOrder = ['P1', 'P2'], winner = 'P1', winningSeat = 1, pairedRunId = null, pairedLeg = null, seatSwapped = false, seed = 1000 + i, turns = 10 } = {}) => ({
  matchId: `M-${i}`, matchOrdinal: i, seed,
  profileId: 'core-advanced-authority',
  policyIds, seatOrder, pairedRunId, seatSwapped,
  ...(pairedLeg ? { pairedLeg } : {}),
  winner, winningSeat, terminationReason: 'NORMAL_VICTORY',
  completedFullTurns: turns, scoreMargin: 2,
  finalScores: { P1: winner === 'P1' ? 21 : 8, P2: winner === 'P2' ? 21 : 8 },
  ruleCompliance: { status: 'PASS' },
});

/** A verified AB/BA block under the corrected scheduler semantics. */
const trueBlock = (blockIndex, { a = 'control', b = 'value', aWinsBoth = false } = {}) => ([
  stubRow(blockIndex * 2, {
    policyIds: [a, b], seatOrder: ['P1', 'P2'],
    winner: 'P1', winningSeat: aWinsBoth ? 1 : 1,
    pairedRunId: `PR-${blockIndex}`, pairedLeg: 'AB', seatSwapped: false,
  }),
  stubRow(blockIndex * 2 + 1, {
    policyIds: [b, a], seatOrder: ['P2', 'P1'],
    winner: aWinsBoth ? 'P1' : 'P2', // P1 sits in seat2 on the BA leg
    winningSeat: aWinsBoth ? 2 : 1,
    pairedRunId: `PR-${blockIndex}`, pairedLeg: 'BA', seatSwapped: true,
  }),
]);

// ══ A. Scheduler: true AB/BA policy↔seat reversal ═══════════════════════════

test('campaign scheduler produces a true policy↔seat reversal on BA legs', async () => {
  const campaign = await runCampaign({
    profileId: 'core-advanced-authority', matchCount: 4,
    policyPairs: [['random-legal', 'control']],
    workerCount: 1, decisionLimit: 600,
  });
  assert.equal(campaign.completedCount, 4);
  const byPair = new Map();
  for (const s of campaign.summaries) {
    assert.ok(s.pairedRunId, 'every summary carries pairedRunId');
    assert.ok(s.pairedLeg === 'AB' || s.pairedLeg === 'BA', 'every summary carries pairedLeg');
    (byPair.get(s.pairedRunId) ?? byPair.set(s.pairedRunId, []).get(s.pairedRunId)).push(s);
  }
  assert.equal(byPair.size, 2, '4 matches → 2 paired blocks');
  for (const block of byPair.values()) {
    assert.equal(block.length, 2);
    const ab = block.find(s => s.pairedLeg === 'AB');
    const ba = block.find(s => s.pairedLeg === 'BA');
    assert.deepEqual(ab.policyIds, ['random-legal', 'control'], 'AB: seat1=A, seat2=B');
    assert.deepEqual(ba.policyIds, ['control', 'random-legal'], 'BA: seat1=B, seat2=A');
    // Player labels swap too, but that is secondary to the policy swap.
    assert.notDeepEqual(ab.seatOrder, ba.seatOrder);
    // The verified block must pass structural verification.
    assert.equal(verifyPairBlock(block).verified, true);
  }
  // Design-of-record metadata is declared at creation time.
  assert.equal(campaign.experimentDesign?.type, 'paired-ab-ba');
});

test('large schedule: every policy occupies each seat equally across blocks', async () => {
  const campaign = await runCampaign({
    profileId: 'core-advanced-authority', matchCount: 8,
    policyPairs: [['random-legal', 'control']],
    workerCount: 1, decisionLimit: 600,
  });
  const exposure = { 'random-legal': { seat1: 0, seat2: 0 }, control: { seat1: 0, seat2: 0 } };
  for (const s of campaign.summaries) {
    exposure[s.policyIds[0]].seat1 += 1;
    exposure[s.policyIds[1]].seat2 += 1;
  }
  assert.equal(exposure['random-legal'].seat1, 4);
  assert.equal(exposure['random-legal'].seat2, 4);
  assert.equal(exposure.control.seat1, 4);
  assert.equal(exposure.control.seat2, 4);
});

// ══ B. Pair verification: the exact legacy failure is caught ═══════════════

test('LEGACY_LABEL_ONLY_SWAP: reversed player labels with unchanged policyIds fails verification', () => {
  // The exact 2,550-match corpus pattern: P1/P2 labels swap, policies do not.
  const broken = [
    stubRow(0, { policyIds: ['control', 'value'], seatOrder: ['P1', 'P2'], pairedRunId: 'PR-0', seatSwapped: false }),
    stubRow(1, { policyIds: ['control', 'value'], seatOrder: ['P2', 'P1'], pairedRunId: 'PR-0', seatSwapped: true }),
  ];
  const v = verifyPairBlock(broken);
  assert.equal(v.verified, false);
  assert.equal(v.reason, PAIR_BLOCK_REASON.LEGACY_LABEL_ONLY_SWAP);
});

test('verifyPairBlock rejects non-reversed, mismatched, and incomplete blocks', () => {
  const notReversed = [
    stubRow(0, { policyIds: ['control', 'value'], pairedRunId: 'PR-x' }),
    stubRow(1, { policyIds: ['control', 'value'], pairedRunId: 'PR-x' }),
  ];
  assert.equal(verifyPairBlock(notReversed).reason, PAIR_BLOCK_REASON.SEAT_ASSIGNMENT_NOT_REVERSED);
  const mismatch = [
    stubRow(0, { policyIds: ['control', 'value'], pairedRunId: 'PR-y' }),
    stubRow(1, { policyIds: ['tempo', 'value'], pairedRunId: 'PR-y' }),
  ];
  assert.equal(verifyPairBlock(mismatch).reason, PAIR_BLOCK_REASON.PAIR_POLICY_MISMATCH);
  assert.equal(verifyPairBlock([stubRow(0, { pairedRunId: 'PR-z' })]).reason, PAIR_BLOCK_REASON.INCOMPLETE_PAIR);
});

test('self-play blocks verify but are excluded from cross-policy inference', () => {
  const block = [
    stubRow(0, { policyIds: ['control', 'control'], pairedRunId: 'PR-sp', pairedLeg: 'AB' }),
    stubRow(1, { policyIds: ['control', 'control'], pairedRunId: 'PR-sp', pairedLeg: 'BA', seatSwapped: true, seatOrder: ['P2', 'P1'] }),
  ];
  const v = verifyPairBlock(block);
  assert.equal(v.verified, true);
  assert.equal(v.selfPlay, true);
  const analysis = buildPairedABBAAnalysis(block);
  assert.equal(analysis.pairResults[0].designStatus, 'self-play-only');
  assert.equal(analysis.pairResults[0].pairedBlocks, 0);
});

// ══ C. Aggregate paired inference ══════════════════════════════════════════

test('McNemar aggregates across verified blocks — never one test per block', () => {
  const rows = Array.from({ length: 10 }, (_, i) => trueBlock(i)).flat();
  const analysis = buildPairedABBAAnalysis(rows);
  assert.equal(analysis.designStatus, 'verified');
  assert.equal(analysis.totalPairedBlocks, 10);
  const pair = analysis.pairResults.find(r => r.policyPair === 'control__vs__value');
  assert.ok(pair, 'matchup-level result exists');
  // ONE matchup-level McNemar over all 10 blocks — not 10 tests of n=1.
  assert.equal(pair.mcnemar.sampleSize, 10);
  assert.equal(pair.seatSwapVerified, true);
  // Seat-effect concordance is reported separately from policy inference.
  assert.ok(pair.mcnemar.seatEffectConcordant);
});

test('seat-conditioned rates expose per-policy seat splits', () => {
  const rows = Array.from({ length: 6 }, (_, i) => trueBlock(i)).flat();
  const analysis = buildPairedABBAAnalysis(rows);
  const pair = analysis.pairResults[0];
  assert.ok(pair.seatConditioned.control.seat1.games === 6);
  assert.ok(pair.seatConditioned.control.seat2.games === 6);
  // seatBalance aggregates decisive legs across the whole corpus.
  assert.ok(analysis.seatBalance.decisiveLegs > 0);
});

test('the broken corpus (policy pinned to seat) reports malformed — not verified', () => {
  // Reproduce the exported-corpus shape: pairedRunId + seatSwapped present,
  // but policyIds never move seats.
  const rows = Array.from({ length: 6 }, (_, i) => [
    stubRow(i * 2, { policyIds: ['control', 'value'], seatOrder: ['P1', 'P2'], pairedRunId: `PR-${i}` }),
    stubRow(i * 2 + 1, { policyIds: ['control', 'value'], seatOrder: ['P2', 'P1'], pairedRunId: `PR-${i}`, seatSwapped: true }),
  ]).flat();
  const analysis = buildPairedABBAAnalysis(rows);
  assert.equal(analysis.designStatus, 'malformed');
  assert.equal(analysis.totalPairedBlocks, 0);
  assert.ok(analysis.malformedBlocks > 0);
  assert.ok(analysis.scheduleNote?.includes('LEGACY_LABEL_ONLY_SWAP'));
});

// ══ D. Integrity dashboard ═════════════════════════════════════════════════

test('buildExperimentIntegrity passes a verified corpus and fails a broken one', () => {
  const good = Array.from({ length: 4 }, (_, i) => trueBlock(i)).flat();
  const abbaGood = buildPairedABBAAnalysis(good);
  const integrityGood = buildExperimentIntegrity(good, { pairedABBA: abbaGood });
  assert.equal(integrityGood.checks.pairedDesign.status, 'PASS');
  assert.equal(integrityGood.checks.policySeatExposure.status, 'PASS');
  assert.notEqual(integrityGood.overall, 'FAIL');

  const broken = Array.from({ length: 4 }, (_, i) => [
    stubRow(i * 2, { policyIds: ['control', 'value'], pairedRunId: `PR-${i}` }),
    stubRow(i * 2 + 1, { policyIds: ['control', 'value'], pairedRunId: `PR-${i}`, seatSwapped: true, seatOrder: ['P2', 'P1'] }),
  ]).flat();
  const integrityBad = buildExperimentIntegrity(broken, { pairedABBA: buildPairedABBAAnalysis(broken) });
  assert.equal(integrityBad.checks.pairedDesign.status, 'FAIL');
  assert.equal(integrityBad.checks.policySeatExposure.status, 'FAIL');
  assert.equal(integrityBad.overall, 'FAIL');
});

test('integrity dashboard never claims tracing neutrality from summaries', () => {
  const rows = [stubRow(0)];
  const integrity = buildExperimentIntegrity(rows, {});
  assert.equal(integrity.checks.tracingNeutrality.status, 'NOT_TESTED');
});

// ══ E. Statistics contracts ════════════════════════════════════════════════

test('mcnemarPairedTest preserves the existing consumer contract', () => {
  const pairs = [
    { aSeat1Win: true, aSeat2Win: true },   // A sweeps → b
    { bSeat1Win: true, bSeat2Win: true },   // B sweeps → c
    { aSeat1Win: true, bSeat1Win: true },   // seat1 sweeps → concordant
  ];
  const r = mcnemarPairedTest(pairs);
  for (const field of ['b', 'c', 'estimate', 'pValue', 'method', 'sampleSize', 'discordantPairs', 'seatEffectConcordant']) {
    assert.ok(field in r, `missing field ${field}`);
  }
  assert.equal(r.b, 1); assert.equal(r.c, 1);
  assert.equal(r.seatEffectConcordant.seat1AlwaysWins, 1);
  assert.equal(r.method, 'exact-binomial');
});

test('binomialSignTest is exact two-sided p=0.5', () => {
  const r = binomialSignTest(9, 10);
  assert.ok(r.pValue < 0.05, `p=${r.pValue} should be < 0.05 for 9/10`);
  assert.equal(r.method, 'exact-binomial');
  assert.equal(binomialSignTest(5, 10).pValue, 1);
});

// ══ F. Combo reconciliation ════════════════════════════════════════════════

test('combo atlas reconciles declarations to explicit terminal states', () => {
  const comboTelemetry = {
    totals: { opportunities: 4, declarations: 2, resolved: 1, countered: 1, fizzled: 0, broken: 0, pending: 0 },
    seats: [{ opportunityFrames: 4, declarations: 1 }, { opportunityFrames: 0, declarations: 1 }],
    records: [{ id: 'c1' }, { id: 'c2' }],
  };
  const row = {
    ...stubRow(0),
    comboTelemetry,
    participants: [
      { seat: 1, policyId: 'control', result: 'win', comboDeclarationCount: 1 },
      { seat: 2, policyId: 'value', result: 'loss', comboDeclarationCount: 1 },
    ],
  };
  const atlas = buildComboAtlas([row]);
  assert.equal(atlas.reconciliation.status, 'pass');
  assert.equal(atlas.reconciliation.failureCount, 0);

  // Broken ledger: declared=3 but records show 2 → fail-closed.
  const badRow = { ...row, matchId: 'M-bad', comboTelemetry: { ...comboTelemetry, totals: { ...comboTelemetry.totals, declarations: 3 } } };
  const atlasBad = buildComboAtlas([badRow]);
  assert.equal(atlasBad.reconciliation.status, 'fail');
  assert.equal(atlasBad.reconciliation.failureCount, 1);
});

// ══ G. Taxonomy coverage ═══════════════════════════════════════════════════

test('taxonomy coverage separates classified dimensions from true quarantine', () => {
  const tags = ['counter', 'score', 'face-down', 'effect-three', 'discard', 'genuinely-unknown-tag'];
  const cov = taxonomyCoverage(tags);
  assert.equal(cov.registered, 2);            // counter, effect-three
  assert.equal(cov.taxonomyClassified, 3);    // score, face-down, discard
  assert.equal(cov.quarantined, 1);           // genuinely-unknown-tag
  const ledger = quarantineUnknownTags(tags);
  assert.deepEqual(ledger.map(e => e.tag), ['genuinely-unknown-tag']);
});

// ══ H. Deep-tracking gameplay neutrality ═══════════════════════════════════

test('strategicTrace does not change deterministic match outcomes', () => {
  const base = { ordinal: 0, seed: 1478578990, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'], policyIds: ['random-legal', 'control'], decisionLimit: 600 };
  const off = runPolicyMatch({ ...base, strategicTrace: false }).summary;
  const on = runPolicyMatch({ ...base, strategicTrace: true }).summary;
  assert.equal(on.winner, off.winner);
  assert.equal(on.winningSeat, off.winningSeat);
  assert.deepEqual(on.finalScores, off.finalScores);
  assert.equal(on.completedFullTurns, off.completedFullTurns);
  assert.equal(on.terminationReason, off.terminationReason);
  assert.equal(on.finalStateHash, off.finalStateHash, 'tracing must not perturb the final state');
});
