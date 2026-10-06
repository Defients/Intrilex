import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = path.join(root, 'runtime/autonomy-engine-dist/src');
const neocitiesDir = path.join(root, 'neocities-deploy/engine');
const upstreamSrc = path.join(root, 'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/src');

// ── Helpers ──────────────────────────────────────────────────────────

async function readRuntime(file) {
  return await readFile(path.join(runtimeDir, file), 'utf8');
}

async function readRuntimeDts(file) {
  return await readFile(path.join(runtimeDir, file.replace(/\.js$/, '.d.ts')), 'utf8');
}

async function readNeocities(file) {
  return await readFile(path.join(neocitiesDir, file), 'utf8');
}

async function _readSource(file) {
  return await readFile(path.join(upstreamSrc, file), 'utf8');
}

// ── Fix #1: Stale neocities-deploy sync ──────────────────────────────

test('Fix #1: neocities-deploy core-response.js has restricted targetAcceptsCounter for primary targets', async () => {
  const source = await readNeocities('core-response.js');
  // The fixed version restricts super-ace-counter/ultra-three-red primary targets to
  // ["ordinary-effect", "rank10"] instead of a bare "return true" for all primary targets.
  assert.ok(source.includes('"ordinary-effect"') && source.includes('"rank10"'),
    'neocities-deploy core-response.js should contain the restricted declaration classes');
  // Find the actual code occurrence (not the comment) of super-ace-counter
  const idx1 = source.indexOf('super-ace-counter');
  const idx2 = source.indexOf('super-ace-counter', idx1 + 1);
  const idx3 = source.indexOf('super-ace-counter', idx2 + 1);
  assert.ok(idx3 >= 0, 'super-ace-counter should appear in code (not just comments)');
  // The code block should contain the declaration class restriction
  const block = source.substring(idx3, idx3 + 500);
  assert.ok(block.includes('ordinary-effect') && block.includes('rank10'),
    'super-ace-counter primary target check should restrict to ordinary-effect and rank10');
});

test('Fix #1: runtime core-response.js has restricted targetAcceptsCounter', async () => {
  const source = await readRuntime('core-response.js');
  assert.ok(source.includes('"ordinary-effect"') && source.includes('"rank10"'),
    'runtime core-response.js should contain the restricted declaration classes');
});

// ── Fix #2: Royal Shield enforcement ──────────────────────────────────

test('Fix #2: StackItem has royalShieldProtected field in types', async () => {
  const dts = await readRuntimeDts('types.js');
  assert.ok(dts.includes('royalShieldProtected'),
    'runtime types.d.ts should contain royalShieldProtected field');
});

test('Fix #2: declareCoreStackItem sets royalShieldProtected for primary plays', async () => {
  const source = await readRuntime('core-authority.js');
  assert.ok(source.includes('royalShieldProtected'),
    'runtime core-authority.js should reference royalShieldProtected in declareCoreStackItem');
});

test('Fix #2: targetAcceptsCounter checks royalShieldProtected for base/anchor ace', async () => {
  const source = await readRuntime('core-response.js');
  assert.ok(source.includes('royalShieldProtected'),
    'runtime core-response.js should check royalShieldProtected in targetAcceptsCounter');
  assert.ok(source.includes('base-ace-counter') && source.includes('anchor-ace-counter'),
    'runtime core-response.js should reference base-ace-counter and anchor-ace-counter in Royal Shield check');
});

// ── Fix #3: Voltage 4 branches + private guess ───────────────────────

test('Fix #3: Voltage 4 has rank-only, suit-only, and no-match branches', async () => {
  const source = await readRuntime('core-advanced.js');
  assert.ok(source.includes('matched: "rank"'),
    'Voltage 4 should have a rank-match branch');
  assert.ok(source.includes('matched: "suit"'),
    'Voltage 4 should have a suit-match branch');
  assert.ok(source.includes('matched: "none"'),
    'Voltage 4 should have a no-match branch');
});

test('Fix #3: Voltage 4 event uses authorized visibility', async () => {
  const source = await readRuntime('core-advanced.js');
  const idx = source.indexOf('VOLTAGE_FOUR_RESOLVED');
  assert.ok(idx >= 0, 'VOLTAGE_FOUR_RESOLVED event should exist');
  const snippet = source.substring(idx, idx + 300);
  assert.ok(snippet.includes('visibility'),
    'Voltage 4 event should have visibility field (private/authorized)');
});

// ── Fix #4: Generated Seven / Topdeck Casting ────────────────────────

test('Fix #4: generatedCoreEffectCandidates supports multi-card declarations', async () => {
  const source = await readRuntime('core-private-choice.js');
  assert.ok(source.includes('entry.sourceCardIds.includes(cardId)'),
    'generatedCoreEffectCandidates should support multi-card (Super/Combo) declarations');
});

test('Fix #4: generatedAdvancedCandidates function exists', async () => {
  const source = await readRuntime('core-private-choice.js');
  assert.ok(source.includes('generatedAdvancedCandidates'),
    'generatedAdvancedCandidates function should exist for Super declarations within Generated Seven');
});

test('Fix #4: core-rank7-generated-effect submission supports generatedAdvanced', async () => {
  const source = await readRuntime('core-private-choice.js');
  assert.ok(source.includes('generatedAdvanced'),
    'core-rank7-generated-effect handler should support generatedAdvanced');
  assert.ok(source.includes('CORE_SEVEN_GENERATED_ADVANCED_SELECTED'),
    'Should emit CORE_SEVEN_GENERATED_ADVANCED_SELECTED event');
});

test('Fix #4: ⭐7 does not scrap effect cards to GY', async () => {
  const source = await readRuntime('core-advanced.js');
  const idx = source.indexOf('case "advanced-super-seven-topdeck": {');
  assert.ok(idx >= 0, '⭐7 case handler should exist');
  const block = source.substring(idx, idx + 3000);
  assert.ok(!block.includes('moveCard(s,id,"GY",actorId);s.metadata.lastGeneratedEffectCardId'),
    '⭐7 should not scrap effect cards to GY');
  assert.ok(block.includes('privateChoiceHeldBy') || block.includes('beginChoice'),
    '⭐7 should hold effect cards for generated play resolution');
});

test('Fix #4: ⭐7 reveals 2 cards (not 4)', async () => {
  const source = await readRuntime('core-advanced.js');
  const idx = source.indexOf('case "advanced-super-seven-topdeck": {');
  const block = source.substring(idx, idx + 3000);
  assert.ok(block.includes('Math.min(2,'),
    '⭐7 should reveal up to 2 cards (not 4)');
});

// ── Fix #5: BJ Exile Recycle trigger ─────────────────────────────────

test('Fix #5: core-bj-exile-recycle private choice kind exists in types', async () => {
  const dts = await readRuntimeDts('types.js');
  assert.ok(dts.includes('core-bj-exile-recycle'),
    'types.d.ts should have core-bj-exile-recycle private choice kind');
});

test('Fix #5: core-score initiates BJ Exile Recycle for BJ', async () => {
  const source = await readRuntime('core-authority.js');
  assert.ok(source.includes('core-bj-exile-recycle'),
    'core-authority.js core-score should initiate BJ Exile Recycle');
  assert.ok(source.includes('"BJ"'),
    'core-score should check for BJ identity');
});

test('Fix #5: BJ Exile Recycle submission handler exists', async () => {
  const source = await readRuntime('core-private-choice.js');
  assert.ok(source.includes('CORE_BJ_EXILE_RECYCLE_RESOLVED'),
    'core-private-choice.js should handle BJ Exile Recycle submission');
});

// ── Fix #6: Seven scoring trigger ────────────────────────────────────

test('Fix #6: core-seven-scoring-trigger private choice kind exists in types', async () => {
  const dts = await readRuntimeDts('types.js');
  assert.ok(dts.includes('core-seven-scoring-trigger'),
    'types.d.ts should have core-seven-scoring-trigger private choice kind');
});

test('Fix #6: core-score initiates Seven scoring trigger for rank 7', async () => {
  const source = await readRuntime('core-authority.js');
  assert.ok(source.includes('core-seven-scoring-trigger'),
    'core-authority.js core-score should initiate Seven scoring trigger');
});

test('Fix #6: Seven scoring trigger submission handler exists', async () => {
  const source = await readRuntime('core-private-choice.js');
  assert.ok(source.includes('CORE_SEVEN_SCORING_TRIGGER_RESOLVED'),
    'core-private-choice.js should handle Seven scoring trigger submission');
});

// ── Fix #7: 10♣ Aegis on score ───────────────────────────────────────

test('Fix #7: core-score grants Aegis for 10♣', async () => {
  const source = await readRuntime('core-authority.js');
  assert.ok(source.includes('10♣-score'),
    'core-authority.js should apply Aegis with "10♣-score" source ref');
  assert.ok(source.includes('"10♣"'),
    'core-score should check for 10♣ identity');
  assert.ok(source.includes('applyAegis'),
    'core-score should call applyAegis for 10♣');
});

// ── Fix #8: Nine Goal Shift enumeration ──────────────────────────────

test('Fix #8: Nine Goal Shift is enumerated in core-autonomy', async () => {
  const source = await readRuntime('core-autonomy.js');
  assert.ok(source.includes('nine-goal-shift-3'),
    'core-autonomy.js should enumerate Nine Goal Shift +3');
  assert.ok(source.includes('nine-goal-shift-5'),
    'core-autonomy.js should enumerate Nine Goal Shift +5');
  assert.ok(source.includes('goal-shift-nine'),
    'core-autonomy.js should use goal-shift-nine rank action');
});

test('Fix #8: Nine Goal Shift 9♠ ownGoalDelta=-2 is enumerated', async () => {
  const source = await readRuntime('core-autonomy.js');
  assert.ok(source.includes('nine-spade-goal-shift-5'),
    'core-autonomy.js should enumerate 9♠ +5 with ownGoalDelta=-2');
  assert.ok(source.includes('ownGoalDelta: -2'),
    'core-autonomy.js should include ownGoalDelta: -2 for 9♠');
});

test('Fix #8: goal-shift-nine resolver exists in ranks', async () => {
  const source = await readRuntime('ranks.js');
  assert.ok(source.includes('goal-shift-nine'),
    'ranks.js should have goal-shift-nine resolver');
  assert.ok(source.includes('NINE_GOAL_SHIFT_RESOLVED'),
    'ranks.js should emit NINE_GOAL_SHIFT_RESOLVED event');
});

// ── Fix #9: Natural 4 ────────────────────────────────────────────────

test('Fix #9: natural-four RankAction type exists in types', async () => {
  const dts = await readRuntimeDts('types.js');
  assert.ok(dts.includes('natural-four'),
    'types.d.ts should have natural-four RankAction type');
});

test('Fix #9: natural-four resolver exists in ranks', async () => {
  const source = await readRuntime('ranks.js');
  assert.ok(source.includes('case "natural-four"'),
    'ranks.js should have natural-four resolver case');
  assert.ok(source.includes('NATURAL_FOUR_RESOLVED'),
    'ranks.js should emit NATURAL_FOUR_RESOLVED event');
});

test('Fix #9: natural-four is enumerated in core-effects', async () => {
  const source = await readRuntime('core-effects.js');
  assert.ok(source.includes('natural-four'),
    'core-effects.js should enumerate natural-four as a private-choice effect');
});

test('Fix #9: natural-four private choice handler exists', async () => {
  const source = await readRuntime('core-private-choice.js');
  assert.ok(source.includes('core-natural-four-reorder'),
    'core-private-choice.js should handle core-natural-four-reorder submission');
  assert.ok(source.includes('CORE_NATURAL_FOUR_REVEALED'),
    'core-private-choice.js should emit CORE_NATURAL_FOUR_REVEALED event');
});

test('Fix #9: natural-four is in isCorePrivateChoiceEffect', async () => {
  const source = await readRuntime('core-private-choice.js');
  assert.ok(source.includes('"natural-four"'),
    'core-private-choice.js isCorePrivateChoiceEffect should include natural-four');
});

// ── Fix #10: Sudden Death Guard + rank immunity ──────────────────────

test('Fix #10: Sudden Death checks Guard protection', async () => {
  const source = await readRuntime('core-advanced.js');
  assert.ok(source.includes('guardProviderIds'),
    'core-advanced.js should use guardProviderIds for Sudden Death target check');
  assert.ok(source.includes('no Guard'),
    'Sudden Death should fail with "no Guard" message');
});

test('Fix #10: Sudden Death checks rank immunity', async () => {
  const source = await readRuntime('core-advanced.js');
  assert.ok(source.includes('rankDefinition'),
    'core-advanced.js should use rankDefinition for Sudden Death target check');
  assert.ok(source.includes('no rank immunity'),
    'Sudden Death should fail with "no rank immunity" message');
});

test('Fix #10: Sudden Death autonomy filters Guard-protected and rank-immune targets', async () => {
  const source = await readRuntime('core-advanced.js');
  // The autonomy enumeration should filter out Guard-protected and rank-immune cards
  assert.ok(source.includes('guardProviderIds(s, c).length === 0'),
    'Sudden Death autonomy should filter Guard-protected cards');
  assert.ok(source.includes('prEffectTargetImmune !== true'),
    'Sudden Death autonomy should filter rank-immune cards');
});
