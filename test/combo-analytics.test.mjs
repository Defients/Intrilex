// ═══════════════════════════════════════════════════════════════
// combo-analytics.test.mjs — First-class Combo intelligence tests.
//
// Covers the canonical §8 contract end-to-end:
//   - classification (super/ultra classes are Combos; royal-marriage,
//     queens-court, rank10 mimics, K♠ counters, generic multi-card plays
//     and voltage are NOT);
//   - legal-opportunity tracking at the legality boundary;
//   - lifecycle binding by stackItemId (resolved / countered / fizzled);
//   - 4♥ Combo Breaker honestly reported unavailable (never inferred);
//   - legacy rankDecisions fallback (opportunities real, lifecycle
//     unobserved — nothing fabricated);
//   - propensity = declarations / legal opportunities (not raw counts);
//   - recipe + component aggregation;
//   - hash exclusion (diagnostic telemetry never enters matchResultHash);
//   - browser-mirror registration.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createComboTracker, comboClassOf, isComboAction, comboRecipeId,
  COMBO_TELEMETRY_SCHEMA_VERSION, COMBO_LIFECYCLE,
} from '@intrilex/simulation-runtime/combo-telemetry';
import {
  buildComboAtlas, comboClassOf as atlasComboClassOf, comboRecipeId as atlasComboRecipeId,
  COMBO_ANALYTICS_SCHEMA_VERSION,
} from '@intrilex/analytics/combo-analytics';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { hashCanonical } from '@intrilex/shared';

// ── Classification ────────────────────────────────────────────────────────

test('Combo classification: super/ultra/counter-combo classes are canonical Combos', () => {
  assert.equal(comboClassOf({ family: 'super', mode: 'two-score' }), 'super');
  assert.equal(comboClassOf({ family: 'ultra', mode: 'three-black-7' }), 'ultra');
  assert.equal(comboClassOf({ family: 'counter', mode: 'super-ace' }), 'super');
  assert.equal(comboClassOf({ family: 'ultra', mode: 'three-red-counter' }), 'ultra');
  assert.equal(comboClassOf({ kind: 'advanced-super-two' }), 'super');
  assert.equal(comboClassOf({ semantics: { effectKind: 'advanced-ultra-2black2red' } }), 'ultra');
  assert.equal(comboClassOf({ kind: 'declare-combo' }), 'generic');
});

test('Combo classification: non-combo mechanics are never classified as Combo', () => {
  assert.equal(comboClassOf({ family: 'royal-marriage', mode: 'marriage' }), null);
  assert.equal(comboClassOf({ family: 'queens-court' }), null);
  assert.equal(comboClassOf({ kind: 'advanced-royal-marriage' }), null);
  assert.equal(comboClassOf({ kind: 'advanced-queens-court' }), null);
  assert.equal(comboClassOf({ kind: 'advanced-rank10-mimic' }), null);
  assert.equal(comboClassOf({ family: 'counter', mode: 'king-spade' }), null);
  assert.equal(comboClassOf({ kind: 'core-declare-king-spade-counter' }), null);
  assert.equal(comboClassOf({ family: 'voltage' }), null);
  // A generic multi-card play with no Combo authority is NOT a Combo.
  assert.equal(comboClassOf({ family: 'score', mode: 'pair', sourceHandles: ['c1', 'c2'] }), null);
  assert.equal(comboClassOf(null), null);
  assert.equal(isComboAction({ family: 'super' }), true);
  assert.equal(isComboAction({ family: 'queens-court' }), false);
});

test('Combo recipe identity: four-exchange variants share one recipe; counters distinct', () => {
  assert.equal(comboRecipeId({ family: 'super', mode: 'four-exchange-pr' }), 'super:four-exchange');
  assert.equal(comboRecipeId({ family: 'super', mode: 'four-exchange-er' }), 'super:four-exchange');
  assert.equal(comboRecipeId({ family: 'super', mode: 'two-score' }), 'super:two-score');
  assert.equal(comboRecipeId({ family: 'counter', mode: 'super-ace' }), 'super:ace-counter');
  assert.equal(comboRecipeId({ family: 'ultra', mode: 'three-red-counter' }), 'ultra:three-red-counter');
  assert.equal(comboRecipeId({ kind: 'declare-combo' }), 'combo:generic');
  assert.equal(comboRecipeId({ family: 'royal-marriage' }), null);
});

test('Combo classifier parity: telemetry and analytics modules agree', () => {
  const cases = [
    { family: 'super', mode: 'two-score' },
    { family: 'ultra', mode: 'three-black-7' },
    { family: 'counter', mode: 'super-ace' },
    { family: 'royal-marriage' },
    { kind: 'declare-combo' },
    { family: 'voltage' },
  ];
  for (const action of cases) {
    assert.equal(comboClassOf(action), atlasComboClassOf(action), `class ${JSON.stringify(action)}`);
    assert.equal(comboRecipeId(action), atlasComboRecipeId(action), `recipe ${JSON.stringify(action)}`);
  }
});

// ── Tracker: opportunities, lifecycle, capability honesty ────────────────

const mkState = (over = {}) => ({
  fullTurnSequence: 4, phase: 'MAIN',
  scores: { P1: 10, P2: 6 },
  cards: { c1: { identity: '7♣' }, c2: { identity: '7♦' }, c3: { identity: 'K♠' } },
  stack: [],
  ...over,
});
const mkTracker = (over = {}) => createComboTracker({
  matchId: 'M-test', seatOrder: ['P1', 'P2'], policyIds: ['alpha', 'beta'],
  scoreOf: (state, id) => state?.scores?.[id] ?? null, ...over,
});

test('Tracker: legal Combo frames count opportunities at the legality boundary', () => {
  const t = mkTracker();
  const state = mkState();
  const legal = [
    { family: 'super', mode: 'two-score', timingClass: 'ACTION', sourceHandles: ['c1', 'c2'] },
    { family: 'super', mode: 'four-exchange-pr', timingClass: 'ACTION', sourceHandles: ['c1', 'c2'] },
    { family: 'royal-marriage', mode: 'marriage', timingClass: 'ACTION' },
    { family: 'score', mode: 'pair', timingClass: 'ACTION' },
  ];
  t.frame({ legalActions: legal, actorId: 'P1', state });
  t.frame({ legalActions: [{ family: 'counter', mode: 'super-ace', timingClass: 'RESPONSE' }], actorId: 'P1', state });
  t.frame({ legalActions: [{ family: 'score', mode: 'pair', timingClass: 'ACTION' }], actorId: 'P2', state }); // no combo → not an opportunity
  const out = t.finish({ winner: 'P1', terminationReason: 'NORMAL_VICTORY' });
  assert.equal(out.schemaVersion, COMBO_TELEMETRY_SCHEMA_VERSION);
  const s1 = out.seats.find((s) => s.seat === 1);
  assert.equal(s1.opportunityFrames, 2);
  assert.equal(s1.actionOpportunityFrames, 1);
  assert.equal(s1.responseOpportunityFrames, 1);
  // ahead: P1 10 vs P2 6 → diff > 0 for both frames
  assert.equal(s1.opportunityContexts.ahead, 2);
  assert.equal(out.seats.find((s) => s.seat === 2).opportunityFrames, 0);
  assert.equal(out.totals.opportunities, 2);
  // Per-recipe opportunity counts
  assert.equal(s1.recipes['super:two-score'].opportunities, 1);
  assert.equal(s1.recipes['super:four-exchange'].opportunities, 1);
  assert.equal(s1.recipes['super:ace-counter'].opportunities, 1);
});

test('Tracker: lifecycle binds by stackItemId — resolved, countered, fizzled', () => {
  const t = mkTracker();
  const state = mkState();
  // Resolved via authority event
  t.declared({
    action: { family: 'super', mode: 'two-score', timingClass: 'ACTION', sourceHandles: ['c1', 'c2'] },
    actorId: 'P1', seat: 0, decisionIndex: 3,
    events: [{ type: 'CORE_ACTION_DECLARED', payload: { stackItemId: 'st-1', stackClass: 'super', sourceCardIds: ['c1', 'c2'], playerId: 'P1' } }],
    stateBefore: state, state, scoreBefore: 10, scoreDiffBefore: 4,
  });
  t.observe([{ type: 'CORE_ROOT_RESOLVED', payload: { stackItemId: 'st-1' } }], mkState({ scores: { P1: 14, P2: 6 } }));
  // Countered via CORE_COUNTER_RESOLVED target
  t.declared({
    action: { family: 'ultra', mode: 'three-black-7', timingClass: 'ACTION', sourceHandles: ['c1'] },
    actorId: 'P2', seat: 1, decisionIndex: 9,
    events: [{ type: 'CORE_ACTION_DECLARED', payload: { stackItemId: 'st-2', stackClass: 'ultra', sourceCardIds: ['c1'], playerId: 'P2' } }],
    stateBefore: state, state, scoreBefore: 6,
  });
  t.observe([{ type: 'CORE_COUNTER_RESOLVED', payload: { stackItemId: 'ctr-9', targetStackItemId: 'st-2', counterKind: 'king-spade-counter', destination: 'GRAVEYARD' } }], mkState({ stack: [{ id: 'ctr-9', controllerId: 'P1' }] }));
  // Fizzled via revalidation failure
  t.observe([{ type: 'CORE_ACTION_DECLARED', payload: { stackItemId: 'st-3', stackClass: 'super', sourceCardIds: ['c2'], playerId: 'P1' } }], state);
  t.observe([{ type: 'CORE_ROOT_FIZZLED', payload: { stackItemId: 'st-3', reasonCode: 'SOURCE_MISSING' } }], state);

  const out = t.finish({ winner: 'P1', terminationReason: 'NORMAL_VICTORY' });
  assert.equal(out.totals.declarations, 3);
  assert.equal(out.totals.resolved, 1);
  assert.equal(out.totals.countered, 1);
  assert.equal(out.totals.fizzled, 1);
  const resolved = out.records.find((r) => r.stackItemId === 'st-1');
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.recipeId, 'super:two-score');
  assert.equal(resolved.comboClass, 'super');
  assert.equal(resolved.seat, 1);
  assert.equal(resolved.policyId, 'alpha');
  assert.equal(resolved.decisionOrdinal, 3);
  assert.equal(resolved.committedCardCount, 2);
  assert.deepEqual(resolved.componentRanks, ['7']);
  assert.deepEqual(resolved.componentSuits.sort(), ['♣', '♦'].sort());
  assert.equal(resolved.scoreDelta, 4);
  assert.equal(resolved.scoreDiffBefore, 4);
  const countered = out.records.find((r) => r.stackItemId === 'st-2');
  assert.equal(countered.status, 'countered');
  assert.equal(countered.counterKind, 'king-spade-counter'); // distinguishable from a breaker
  assert.equal(countered.counteredByActorId, 'P1');
  assert.equal(countered.recipeId, 'ultra:three-black-7');
  const fizzled = out.records.find((r) => r.stackItemId === 'st-3');
  assert.equal(fizzled.status, 'fizzled');
  assert.equal(fizzled.failureReason, 'SOURCE_MISSING');
});

test('Tracker: broken is contractually unreachable — capability flags it unavailable', () => {
  const t = mkTracker();
  const out = t.finish({ winner: 'P1', terminationReason: 'NORMAL_VICTORY' });
  assert.equal(out.capability.brokenObservable, false);
  assert.match(out.capability.brokenReason, /4♥/);
  assert.equal(out.totals.broken, 0);
  assert.ok(COMBO_LIFECYCLE.includes('broken')); // contract slot exists for the future exception
});

test('Tracker: counter-resolution of a combo-class counter settles as resolved', () => {
  const t = mkTracker();
  const state = mkState();
  t.observe([{ type: 'CORE_SUPER_ACE_COUNTER_DECLARED', payload: { stackItemId: 'ctr-1', targetStackItemId: 'root-9', playerId: 'P1', sourceCardId: 'c1' } }], state);
  t.observe([{ type: 'CORE_COUNTER_RESOLVED', payload: { stackItemId: 'ctr-1', targetStackItemId: 'root-9', counterKind: 'super-ace-counter' } }], state);
  const out = t.finish({ winner: 'P1', terminationReason: 'NORMAL_VICTORY' });
  const rec = out.records.find((r) => r.stackItemId === 'ctr-1');
  assert.equal(rec.status, 'resolved');
  assert.equal(rec.counteredTargetStackItemId, 'root-9');
});

// ── Aggregator: buildComboAtlas ───────────────────────────────────────────

const mkTelemetrySummary = ({ id, winner = 'P1' } = {}) => ({
  matchId: id, winner, terminationReason: 'NORMAL_VICTORY', profileId: 'core-advanced-authority',
  participants: [
    { matchId: id, seat: 1, playerId: 'P1', policyId: 'alpha', result: 'win', comboOpportunityCount: 4, comboDeclarationCount: 2 },
    { matchId: id, seat: 2, playerId: 'P2', policyId: 'beta', result: 'loss', comboOpportunityCount: 3, comboDeclarationCount: 1 },
  ],
  comboTelemetry: {
    schemaVersion: '1.0.0',
    capability: { lifecycleSource: 'authority-events', brokenObservable: false },
    totals: { opportunities: 7, declarations: 3 },
    seats: [
      { seat: 1, playerId: 'P1', policyId: 'alpha', opportunityFrames: 4, actionOpportunityFrames: 3, responseOpportunityFrames: 1, opportunityContexts: { ahead: 3, tied: 0, behind: 1 }, declarations: 2, recipes: { 'super:two-score': { opportunities: 3, declarations: 1 } } },
      { seat: 2, playerId: 'P2', policyId: 'beta', opportunityFrames: 3, actionOpportunityFrames: 2, responseOpportunityFrames: 1, opportunityContexts: { ahead: 0, tied: 1, behind: 2 }, declarations: 1, recipes: { 'ultra:three-black-7': { opportunities: 2, declarations: 1 } } },
    ],
    records: [
      { matchId: id, seat: 1, actorId: 'P1', policyId: 'alpha', decisionOrdinal: 2, status: 'resolved', recipeId: 'super:two-score', comboClass: 'super', declarationContext: 'action', committedCardCount: 2, componentRanks: ['2'], componentSuits: ['♠'], componentIdentities: ['2♠', '2♣'], scoreDiffBefore: 4, wonMatch: true },
      { matchId: id, seat: 1, actorId: 'P1', policyId: 'alpha', decisionOrdinal: 7, status: 'countered', recipeId: 'super:ace-counter', comboClass: 'super', declarationContext: 'response', counterKind: 'king-spade-counter', committedCardCount: 2, componentRanks: ['A'], componentSuits: ['♠'], componentIdentities: ['A♠', '5♠'], scoreDiffBefore: 0, wonMatch: true },
      { matchId: id, seat: 2, actorId: 'P2', policyId: 'beta', decisionOrdinal: 11, status: 'resolved', recipeId: 'ultra:three-black-7', comboClass: 'ultra', declarationContext: 'action', committedCardCount: 3, componentRanks: ['7'], componentSuits: ['♣', '♠'], componentIdentities: ['7♣', '7♠', '8♣'], scoreDiffBefore: -3, wonMatch: false },
    ],
  },
});

const mkLegacySummary = ({ id } = {}) => ({
  matchId: id, winner: 'P1', terminationReason: 'NORMAL_VICTORY', profileId: 'core-advanced-authority',
  participants: [
    { matchId: id, seat: 1, playerId: 'P1', policyId: 'alpha', result: 'win' },
    { matchId: id, seat: 2, playerId: 'P2', policyId: 'beta', result: 'loss' },
  ],
  rankDecisions: [
    {
      participantId: 'P1', decisionIndex: 4,
      legalActions: [
        { family: 'super', mode: 'two-score', timingClass: 'ACTION' },
        { family: 'super', mode: 'three-raid', timingClass: 'ACTION' },
        { family: 'score', mode: 'single', timingClass: 'ACTION' },
        { family: 'royal-marriage', timingClass: 'ACTION' },
      ],
      action: { family: 'super', mode: 'two-score', timingClass: 'ACTION' },
      rankAttribution: { sourceRanks: ['2', '2'] },
    },
    {
      participantId: 'P2', decisionIndex: 8,
      legalActions: [{ family: 'score', mode: 'single', timingClass: 'ACTION' }],
      action: { family: 'score', mode: 'single', timingClass: 'ACTION' },
      rankAttribution: { sourceRanks: ['5'] },
    },
  ],
});

test('buildComboAtlas: telemetry-covered dataset — totals, funnel, lifecycle', () => {
  const atlas = buildComboAtlas([mkTelemetrySummary({ id: 'M1' }), mkTelemetrySummary({ id: 'M2' })]);
  assert.equal(atlas.schemaVersion, COMBO_ANALYTICS_SCHEMA_VERSION);
  assert.equal(atlas.coverage.lifecycleStatus, 'covered');
  assert.equal(atlas.coverage.brokenStatus, 'unavailable');
  assert.match(atlas.coverage.brokenReason, /4♥/);
  const t = atlas.totals;
  assert.equal(t.opportunities, 14);
  assert.equal(t.declarations, 6);
  assert.equal(t.resolved, 4);
  assert.equal(t.countered, 2);
  assert.equal(t.fizzled, 0);
  assert.equal(t.broken, 0); // measured zero? no — contractually unavailable; see brokenStatus
  assert.equal(t.pickRate, 6 / 14);
  assert.equal(t.gamesWithCombo, 2);
  assert.equal(t.resolveRate, 4 / 6);
  assert.equal(atlas.funnel.opportunities, 14);
  assert.equal(atlas.funnel.declared, 6);
  assert.equal(atlas.funnel.resolved, 4);
  assert.equal(atlas.funnel.countered, 2);
  assert.equal(atlas.lifecycle.counterAuthorities['king-spade-counter'], 2);
  assert.equal(atlas.lifecycle.brokenStatus, 'unavailable');
});

test('buildComboAtlas: recipes carry pick rate, resolve rate, honest break status', () => {
  const atlas = buildComboAtlas([mkTelemetrySummary({ id: 'M1' })]);
  const secure = atlas.recipes.find((r) => r.recipeId === 'super:two-score');
  assert.ok(secure);
  assert.equal(secure.uses, 1);
  assert.equal(secure.opportunities, 3); // seat-recipe map for seat 1 only
  assert.equal(secure.pickRate, 1 / 3);
  assert.equal(secure.resolveRate, 1);
  assert.equal(secure.breakRateStatus.status, 'unavailable');
  assert.equal(secure.breakRateStatus.reasonCode, 'BREAKER_NOT_IMPLEMENTED');
  const ultra = atlas.recipes.find((r) => r.recipeId === 'ultra:three-black-7');
  assert.equal(ultra.uses, 1);
  assert.equal(ultra.label, '🌠3B · 7');
  // A recipe declared without retained opportunity telemetry is reported as
  // missing-telemetry, never as a fabricated 0% pick rate.
  const ace = atlas.recipes.find((r) => r.recipeId === 'super:ace-counter');
  assert.equal(ace.pickRate, null);
  assert.equal(ace.pickRateStatus.status, 'missing-telemetry');
});

test('buildComboAtlas: components aggregate by rank, suit, and card identity', () => {
  const atlas = buildComboAtlas([mkTelemetrySummary({ id: 'M1' })]);
  const rank7 = atlas.components.ranks.find((r) => r.rank === '7');
  assert.equal(rank7.declarations, 1);
  assert.equal(rank7.resolved, 1);
  const aSpades = atlas.components.cards.find((c) => c.identity === 'A♠');
  assert.equal(aSpades.declarations, 1);
  assert.equal(aSpades.resolved, 0);
  const spades = atlas.components.suits.find((s) => s.suit === '♠');
  assert.equal(spades.declarations, 3);
});

test('buildComboAtlas: policy propensity is declarations / legal opportunities', () => {
  const atlas = buildComboAtlas([mkTelemetrySummary({ id: 'M1' }), mkTelemetrySummary({ id: 'M2' })]);
  const alpha = atlas.policies.find((p) => p.policyId === 'alpha');
  assert.equal(alpha.opportunities, 8);
  assert.equal(alpha.declarations, 4);
  assert.equal(alpha.comboPropensity, 0.5);
  assert.equal(alpha.winRate, 1);
  const beta = atlas.policies.find((p) => p.policyId === 'beta');
  assert.equal(beta.comboPropensity, 2 / 6);
});

test('buildComboAtlas: legacy rankDecisions fallback — opportunities real, lifecycle unobserved', () => {
  const atlas = buildComboAtlas([mkLegacySummary({ id: 'L1' })]);
  assert.equal(atlas.coverage.fallbackMatches, 1);
  assert.equal(atlas.coverage.lifecycleStatus, 'unavailable');
  assert.equal(atlas.totals.declarations, 1);           // the declared super
  assert.equal(atlas.totals.opportunities, 1);          // one retained legal-action frame carried a Combo
  assert.equal(atlas.totals.pickRate, 1);               // 1 declaration / 1 opportunity frame
  const rec = atlas.records.find((r) => r.comboId.startsWith('CBF-'));
  assert.ok(rec);
  assert.equal(rec.lifecycleStatus, 'unobserved');
  assert.equal(rec.recipeId, 'super:two-score');
  assert.deepEqual(rec.componentRanks, ['2']);
  // Legacy records never fabricate lifecycle counts.
  assert.equal(atlas.totals.unobserved, 1);
});

test('buildComboAtlas: empty dataset reports no-data, never fabricated zeros', () => {
  const atlas = buildComboAtlas([]);
  assert.equal(atlas.coverage.lifecycleStatus, 'no-data');
  assert.equal(atlas.totals.opportunities, 0);
  assert.equal(atlas.totals.declarations, 0);
  assert.equal(atlas.totals.pickRate, null);
  assert.equal(atlas.totals.pickRateStatus.status, 'zero-opportunities');
  assert.equal(atlas.totals.resolveRate, null);
});

test('buildComboAtlas: mixed coverage is disclosed as partial', () => {
  const atlas = buildComboAtlas([mkTelemetrySummary({ id: 'M1' }), mkLegacySummary({ id: 'L1' })]);
  assert.equal(atlas.coverage.lifecycleStatus, 'partial');
  assert.equal(atlas.coverage.telemetryMatches, 1);
  assert.equal(atlas.coverage.fallbackMatches, 1);
  assert.ok(atlas.limitations.some((l) => l.includes('partial')));
});

// ── Runtime integration: real engine match ────────────────────────────────

test('Combo telemetry is present and deterministic on a real engine match', () => {
  const cfg = {
    ordinal: 0, profileId: 'core-advanced-authority',
    policyIds: ['random-legal', 'random-legal'], seatOrder: ['P1', 'P2'],
    seed: 4242, includeReplay: false,
  };
  const a = runPolicyMatch(cfg);
  const b = runPolicyMatch(cfg);
  assert.ok(a.summary.comboTelemetry, 'summary.comboTelemetry must exist');
  assert.equal(a.summary.comboTelemetry.schemaVersion, '1.0.0');
  assert.equal(a.summary.matchResultHash, b.summary.matchResultHash, 'telemetry must not perturb the semantic hash');
  assert.equal(
    JSON.stringify(a.summary.comboTelemetry),
    JSON.stringify(b.summary.comboTelemetry),
    'combo telemetry must be deterministic for a fixed seed',
  );
  for (const p of a.summary.participants) {
    assert.ok(Number.isFinite(p.comboOpportunityCount), 'participant comboOpportunityCount');
    assert.ok(Number.isFinite(p.comboDeclarationCount), 'participant comboDeclarationCount');
  }
});

test('matchResultHash input excludes comboTelemetry and per-participant combo counters', () => {
  // Structural check: comboTelemetry is attached to the summary AFTER the
  // hash input is built — the hashInput block must not reference it, and
  // participant combo counters must be stripped alongside the existing
  // diagnostic opportunity counts.
  const src = readFileSync(new URL('../packages/simulation-runtime/src/runtime.mjs', import.meta.url), 'utf8');
  const hashBlock = src.match(/const hashInput = \{[\s\S]*?\};/);
  assert.ok(hashBlock, 'hashInput block found');
  assert.ok(!hashBlock[0].includes('comboTelemetry'), 'comboTelemetry must not enter the match hash');
  assert.ok(hashBlock[0].includes('comboOpportunityCount'), 'participant combo counters stripped from hash');
});

// ── Browser mirror registration ──────────────────────────────────────────

test('Browser mirror: build.mjs registers combo telemetry + analytics modules', () => {
  const src = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes("'combo-telemetry.mjs'"), 'combo-telemetry.mjs mirrored to dist/evolution');
  assert.ok(src.includes("combo-analytics.mjs"), 'combo-analytics.mjs mirrored to shared-analytics');
});

test('Browser runtime mirror carries identical tracker integration', () => {
  const src = readFileSync(new URL('../apps/lab-web/src/autonomy-runtime.js', import.meta.url), 'utf8');
  assert.ok(src.includes('combo-telemetry.mjs'), 'autonomy-runtime imports the tracker');
  assert.ok(src.includes('comboTracker'), 'autonomy-runtime initializes the tracker');
});

test('Mechanic taxonomy registers combo as canonical parent (super/ultra stay distinct)', () => {
  const registry = readFileSync(new URL('../packages/decision-intelligence/src/mechanic-registry.mjs', import.meta.url), 'utf8');
  assert.ok(/mechanicId:\s*'combo'|"combo"/.test(registry) || /['"]combo['"]/.test(registry), 'combo registered');
  const browserRegistry = readFileSync(new URL('../apps/lab-web/src/mechanic-registry-browser.js', import.meta.url), 'utf8');
  assert.ok(/['"]combo['"]/.test(browserRegistry), 'browser registry registers combo');
});

test('Dossier + DISCOVER integrations carry Combo evidence', () => {
  const dossier = readFileSync(new URL('../apps/lab-web/src/analysis-dossier.js', import.meta.url), 'utf8');
  assert.ok(dossier.includes('sections.combo'), 'dossier includes the combo section');
  const scan = readFileSync(new URL('../packages/simulation-runtime/src/discovery-scan.mjs', import.meta.url), 'utf8');
  assert.ok(scan.includes('combo-propensity'), 'discovery scan emits combo-propensity candidates');
  assert.ok(scan.includes('comboTelemetry'), 'discovery scan reads retained combo telemetry');
});

test('Combo Atlas workspace is routed, rendered, and honest about breaker status', () => {
  const router = readFileSync(new URL('../apps/lab-web/src/router.js', import.meta.url), 'utf8');
  assert.ok(router.includes("'/combo'"), 'route registered');
  const appJs = readFileSync(new URL('../apps/lab-web/src/app.js', import.meta.url), 'utf8');
  assert.ok(appJs.includes('renderComboAtlas'), 'renderer mapped');
  const ws = readFileSync(new URL('../apps/lab-web/src/workspaces/combo-atlas.js', import.meta.url), 'utf8');
  assert.ok(ws.includes('combo-propensity') === false, 'workspace does not fake propensity');
  assert.ok(/Broken|breaker/.test(ws), 'breaker status disclosed');
  // Hash sanity: fixture summary combo telemetry is JSON-serializable canonically
  const s = mkTelemetrySummary({ id: 'H1' });
  assert.equal(typeof hashCanonical({ comboTelemetry: s.comboTelemetry }), 'string');
});
