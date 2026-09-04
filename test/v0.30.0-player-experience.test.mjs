// ═══════════════════════════════════════════════════════════════
// v0.30.0-player-experience.test.mjs
// Tests for the v0.30.0 Player Experience sprint:
// - Game-start experience (profile explanations, AI difficulty, seed, resume)
// - Card Inspector bridge (protection status, learning links, unavailable detail)
// - Academy progression (OBJECTIVES mode, markUnderstood, puzzle recommendations)
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(f, 'utf8');

// ── Game-start experience ──────────────────────────────────────

test('v0.30.0: ranked-duel-hub exports renderNewMatchSetup with options', async () => {
  const hub = await import('../apps/lab-web/src/play/ranked-duel-hub.mjs');
  assert.equal(typeof hub.renderNewMatchSetup, 'function');
  assert.equal(typeof hub.renderResumePrompt, 'function');
  assert.equal(typeof hub.renderCompatibilityWarning, 'function');
});

test('v0.30.0: renderNewMatchSetup includes profile explanations', async () => {
  const { renderNewMatchSetup } = await import('../apps/lab-web/src/play/ranked-duel-hub.mjs');
  const html = renderNewMatchSetup([]);
  assert.ok(html.includes('profile-explainer'), 'Must include profile explainer container');
  assert.ok(html.includes('profile-explanation'), 'Must include profile explanation elements');
  assert.ok(html.includes('First Contact'), 'Must explain First Contact profile');
  assert.ok(html.includes('Advanced Core'), 'Must explain Advanced Core profile');
  assert.ok(html.includes('Unrestricted'), 'Must explain Unrestricted profile');
  assert.ok(html.includes('recommendedFor') || html.includes('New players') || html.includes('Experienced'), 'Must include recommended audience');
});

test('v0.30.0: renderNewMatchSetup includes AI difficulty descriptions', async () => {
  const { renderNewMatchSetup } = await import('../apps/lab-web/src/play/ranked-duel-hub.mjs');
  const catalog = [
    { policyId: 'hybrix-rusher-easy', traits: { archetype: 'rusher', difficulty: 'easy' } },
    { policyId: 'hybix-defender-normal', traits: { archetype: 'defender', difficulty: 'normal' } },
    { policyId: 'hybrix-sniper-hard', traits: { archetype: 'sniper', difficulty: 'hard' } },
    { policyId: 'hybrix-tank-nightmare', traits: { archetype: 'tank', difficulty: 'nightmare' } },
  ];
  const html = renderNewMatchSetup(catalog);
  assert.ok(html.includes('difficulty-description'), 'Must include difficulty descriptions');
  assert.ok(html.includes('Forgiving'), 'Must describe Easy as forgiving');
  assert.ok(html.includes('Balanced'), 'Must describe Normal as balanced');
  assert.ok(html.includes('Skilled'), 'Must describe Hard as skilled');
  assert.ok(html.includes('Ruthless'), 'Must describe Nightmare as ruthless');
});

test('v0.30.0: seed controls are hidden under Advanced options', async () => {
  const { renderNewMatchSetup } = await import('../apps/lab-web/src/play/ranked-duel-hub.mjs');
  const html = renderNewMatchSetup([]);
  assert.ok(html.includes('setup-advanced'), 'Must include Advanced options disclosure');
  assert.ok(html.includes('<details'), 'Advanced options must use <details> element');
  assert.ok(html.includes('seed-input'), 'Must still include seed input inside Advanced');
  assert.ok(html.includes('seed-hint'), 'Must include seed hint text');
});

test('v0.30.0: renderResumePrompt shows save info when available', async () => {
  const { renderResumePrompt } = await import('../apps/lab-web/src/play/ranked-duel-hub.mjs');
  const html = renderResumePrompt({
    saveId: 'AUTOSAVE-current',
    profileId: 'core-advanced-authority',
    seed: 42,
    turnNumber: 5,
  });
  assert.ok(html.includes('setup-resume-prompt'), 'Must render resume prompt');
  assert.ok(html.includes('resume-match'), 'Must include resume button');
  assert.ok(html.includes('Advanced Core'), 'Must show profile label');
  assert.ok(html.includes('Turn 5'), 'Must show turn number');
  assert.ok(html.includes('Seed 42'), 'Must show seed');
});

test('v0.30.0: renderResumePrompt returns empty when no save', async () => {
  const { renderResumePrompt } = await import('../apps/lab-web/src/play/ranked-duel-hub.mjs');
  assert.equal(renderResumePrompt(null), '');
  assert.equal(renderResumePrompt(undefined), '');
});

test('v0.30.0: renderCompatibilityWarning shows warning message', async () => {
  const { renderCompatibilityWarning } = await import('../apps/lab-web/src/play/ranked-duel-hub.mjs');
  const html = renderCompatibilityWarning({
    type: 'save',
    message: 'This save was created with an older version and may not be compatible.',
  });
  assert.ok(html.includes('setup-compat-warning'), 'Must render compat warning');
  assert.ok(html.includes('Compatibility notice'), 'Must show warning title');
  assert.ok(html.includes('older version'), 'Must show warning message');
});

test('v0.30.0: renderCompatibilityWarning returns empty when no compat info', async () => {
  const { renderCompatibilityWarning } = await import('../apps/lab-web/src/play/ranked-duel-hub.mjs');
  assert.equal(renderCompatibilityWarning(null), '');
});

test('v0.30.0: AI personality cards show description text', async () => {
  const { renderNewMatchSetup } = await import('../apps/lab-web/src/play/ranked-duel-hub.mjs');
  const catalog = [
    { policyId: 'hybix-rusher-easy', traits: { archetype: 'rusher', difficulty: 'easy' } },
  ];
  const html = renderNewMatchSetup(catalog);
  assert.ok(html.includes('ai-personality-desc'), 'Must include personality description');
  assert.ok(html.includes('Aggressive tempo'), 'Must show rusher description');
});

// ── Card Inspector bridge ──────────────────────────────────────

test('v0.30.0: ranked-duel-renderer includes protection status rendering', async () => {
  const src = read('apps/lab-web/src/play/ranked-duel-renderer.mjs');
  assert.ok(src.includes('renderInspectorProtectionStatus'), 'Must define renderInspectorProtectionStatus');
  assert.ok(src.includes('inspector-protection-status'), 'Must include protection status container');
  assert.ok(src.includes('inspector-protection-chip'), 'Must include protection chips');
});

test('v0.30.0: ranked-duel-renderer includes learning links', async () => {
  const src = read('apps/lab-web/src/play/ranked-duel-renderer.mjs');
  assert.ok(src.includes('renderInspectorLearningLinks'), 'Must define renderInspectorLearningLinks');
  assert.ok(src.includes('inspector-learning-links'), 'Must include learning links container');
  assert.ok(src.includes('inspector-academy-link'), 'Must include Academy link');
  assert.ok(src.includes('inspector-puzzle-link'), 'Must include Puzzle link');
});

test('v0.30.0: inspector unavailable explanation includes detail text', async () => {
  const src = read('apps/lab-web/src/play/ranked-duel-renderer.mjs');
  assert.ok(src.includes('inspector-unavailable-detail'), 'Must include unavailable detail container');
  assert.ok(src.includes('inspector-unavailable-detail-text'), 'Must include detailed text');
  assert.ok(src.includes('inspector-unavailable-rule-ref'), 'Must include rule reference');
});

test('v0.30.0: CSS includes protection status and learning link styles', async () => {
  const css = read('apps/lab-web/src/play/ranked-duel.css');
  assert.ok(css.includes('.inspector-protection-status'), 'Must style protection status');
  assert.ok(css.includes('.inspector-protection-chip'), 'Must style protection chips');
  assert.ok(css.includes('.inspector-learning-links'), 'Must style learning links');
  assert.ok(css.includes('.inspector-learning-link'), 'Must style learning link items');
  assert.ok(css.includes('.inspector-unavailable-detail'), 'Must style unavailable detail');
});

// ── Academy progression ────────────────────────────────────────

test('v0.30.0: curriculum uses OBJECTIVES mode for foundations lessons', async () => {
  const src = read('apps/lab-web/src/play/academy/curriculum.mjs');
  // Find the lesson definition (not the V1 map entry) — look for the pattern with tier
  const lesson1Idx = src.indexOf("id: 'foundations-01-draw',\n    tier:");
  assert.ok(lesson1Idx > 0, 'foundations-01-draw lesson definition must exist');
  const lesson1Section = src.substring(lesson1Idx, lesson1Idx + 3000);
  assert.ok(lesson1Section.includes('CompletionMode.OBJECTIVES'), 'foundations-01 must use OBJECTIVES mode');

  const lesson2Idx = src.indexOf("id: 'foundations-02-score',\n    tier:");
  assert.ok(lesson2Idx > 0, 'foundations-02-score lesson definition must exist');
  const lesson2Section = src.substring(lesson2Idx, lesson2Idx + 3000);
  assert.ok(lesson2Section.includes('CompletionMode.OBJECTIVES'), 'foundations-02 must use OBJECTIVES mode');
});

test('v0.30.0: curriculum uses OBJECTIVES_AND_WIN for applied lessons', async () => {
  const src = read('apps/lab-web/src/play/academy/curriculum.mjs');
  // Find the lesson definition (not the V1 map entry) — look for the pattern with tier
  const royalsIdx = src.indexOf("id: 'applied-01-royals',\n    tier:");
  assert.ok(royalsIdx > 0, 'applied-01-royals lesson definition must exist');
  const royalsSection = src.substring(royalsIdx, royalsIdx + 3000);
  assert.ok(royalsSection.includes('CompletionMode.OBJECTIVES_AND_WIN'), 'applied-01-royals must use OBJECTIVES_AND_WIN');

  const comboIdx = src.indexOf("id: 'applied-02-combo',\n    tier:");
  assert.ok(comboIdx > 0, 'applied-02-combo lesson definition must exist');
  const comboSection = src.substring(comboIdx, comboIdx + 3000);
  assert.ok(comboSection.includes('CompletionMode.OBJECTIVES_AND_WIN'), 'applied-02-combo must use OBJECTIVES_AND_WIN');
});

test('v0.30.0: curriculum has no remaining pure WIN mode lessons', async () => {
  const src = read('apps/lab-web/src/play/academy/curriculum.mjs');
  // Count CompletionMode.WIN (not OBJECTIVES_AND_WIN)
  const winMatches = src.match(/CompletionMode\.WIN[,\s]/g) ?? [];
  const objectivesAndWinMatches = src.match(/CompletionMode\.OBJECTIVES_AND_WIN/g) ?? [];
  const objectivesMatches = src.match(/CompletionMode\.OBJECTIVES[,\s]/g) ?? [];
  assert.equal(winMatches.length, 0, 'No lessons should use pure WIN mode');
  assert.ok(objectivesMatches.length >= 8, `Expected 8+ OBJECTIVES lessons, got ${objectivesMatches.length}`);
  assert.ok(objectivesAndWinMatches.length >= 2, `Expected 2+ OBJECTIVES_AND_WIN lessons, got ${objectivesAndWinMatches.length}`);
});

test('v0.30.0: AcademyController has markUnderstood method', async () => {
  const src = read('apps/lab-web/src/play/academy/academy-controller.mjs');
  assert.ok(src.includes('markUnderstood'), 'Must define markUnderstood method');
  assert.ok(src.includes('understoodOnly'), 'Must track understoodOnly flag');
});

test('v0.30.0: puzzle-progress exports getRecommendedLessons', async () => {
  const src = read('apps/lab-web/src/play/puzzle/puzzle-progress.mjs');
  assert.ok(src.includes('getRecommendedLessons'), 'Must export getRecommendedLessons');
  assert.ok(src.includes('PUZZLE_TO_LESSON_MAP'), 'Must define puzzle to lesson mapping');
});

test('v0.30.0: academy-renderer imports and renders recommendations', async () => {
  const src = read('apps/lab-web/src/play/academy/academy-renderer.mjs');
  assert.ok(src.includes('getRecommendedLessons'), 'Must import getRecommendedLessons');
  assert.ok(src.includes('academy-recommendations'), 'Must render recommendations section');
  assert.ok(src.includes('academy-recommendation-item'), 'Must render recommendation items');
});

test('v0.30.0: CSS includes academy recommendation styles', async () => {
  const css = read('apps/lab-web/src/play/play-v3.css');
  assert.ok(css.includes('.academy-recommendations'), 'Must style recommendations section');
  assert.ok(css.includes('.academy-recommendation-item'), 'Must style recommendation items');
});

// ── Version surface ────────────────────────────────────────────

test('v0.30.0: package.json version is 1.0.0', async () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, '1.0.0');
});

test('v0.30.0: save-integrity.js PRODUCT_VERSION is 1.0.0', async () => {
  const src = read('apps/lab-web/src/play/save-integrity.js');
  assert.ok(src.includes("PRODUCT_VERSION = '1.0.0'"));
});

test('v0.30.0: release-identity.json version is 1.0.0', async () => {
  const ri = JSON.parse(read('config/release-identity.json'));
  assert.equal(ri.version, '1.0.0');
  assert.equal(ri.releaseTitle, 'Certified Public Baseline');
});
