// V0.17.0 Phase 4 — Guidance and tutorial tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getTutorialDefinition, getTutorialSetup, TutorialRuntime } from '../apps/lab-web/src/play/tutorial-runtime.js';
import { GuidanceMode,  buildImmediateExplanation,  buildWhyExplanation,  buildUnavailableExplanation } from '../apps/lab-web/src/play/intelligence/action-explanation.js';

const tutorialSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/tutorial-runtime.js'), 'utf8');

// ─── Tutorial Chapter Tests ─────────────────────────────────────

test('getTutorialDefinition: has correct metadata', () => {
  const def = getTutorialDefinition();
  assert.equal(def.tutorialId, 'first-contact-introduction');
  assert.equal(def.version, '1.0.0');
  assert.equal(def.profileId, 'first-contact-trigger-closure');
  assert.ok(def.contentHash);
});

test('getTutorialSetup: returns valid setup', () => {
  const setup = getTutorialSetup();
  assert.equal(setup.profileId, 'first-contact-trigger-closure');
  assert.equal(setup.humanPlayerId, 'P1');
  assert.equal(setup.mode, 'TUTORIAL');
  assert.ok(setup.tutorial);
});

test('CHAPTERS: has at least 15 chapters (spec required moments)', () => {
  const def = getTutorialDefinition();
  assert.ok(def.chapters.length >= 15, `Must have at least 15 chapters, got ${def.chapters.length}`);
});

test('CHAPTERS: includes target-selection chapter', () => {
  const def = getTutorialDefinition();
  assert.ok(def.chapters.some(c => c.id === 'target-selection'), 'Must have target-selection chapter');
});

test('CHAPTERS: includes ordinary-vs-spades chapter', () => {
  const def = getTutorialDefinition();
  assert.ok(def.chapters.some(c => c.id === 'ordinary-vs-spades'), 'Must have ordinary-vs-spades chapter');
});

test('CHAPTERS: includes super-declaration chapter', () => {
  const def = getTutorialDefinition();
  assert.ok(def.chapters.some(c => c.id === 'super-declaration'), 'Must have super-declaration chapter');
});

test('CHAPTERS: includes replay-and-evidence chapter', () => {
  const def = getTutorialDefinition();
  assert.ok(def.chapters.some(c => c.id === 'replay-and-evidence'), 'Must have replay-and-evidence chapter');
});

test('CHAPTERS: each chapter has required fields', () => {
  const def = getTutorialDefinition();
  for (const ch of def.chapters) {
    assert.ok(ch.id, 'Chapter must have id');
    assert.ok(ch.title, 'Chapter must have title');
    assert.ok(ch.text, 'Chapter must have text');
    assert.ok(ch.completion, 'Chapter must have completion');
    assert.ok(ch.focusRegion, 'Chapter must have focusRegion');
  }
});

// ─── TutorialRuntime Tests ──────────────────────────────────────

test('TutorialRuntime: starts at chapter 0', () => {
  const t = new TutorialRuntime();
  assert.equal(t.currentChapterIndex, 0);
  assert.equal(t.isComplete, false);
  assert.equal(t.skipped, false);
});

test('TutorialRuntime: advance moves to next chapter', () => {
  const t = new TutorialRuntime();
  const firstId = t.currentChapter.id;
  t.advance();
  assert.ok(t.completedChapters.has(firstId));
  assert.equal(t.currentChapterIndex, 1);
});

test('TutorialRuntime: skip sets complete', () => {
  const t = new TutorialRuntime();
  t.skip();
  assert.equal(t.skipped, true);
  assert.equal(t.isComplete, true);
});

test('TutorialRuntime: restart resets progress', () => {
  const t = new TutorialRuntime();
  t.advance();
  t.advance();
  t.restart();
  assert.equal(t.currentChapterIndex, 0);
  assert.equal(t.completedChapters.size, 0);
  assert.equal(t.skipped, false);
});

test('TutorialRuntime: save and restore state', () => {
  const t = new TutorialRuntime();
  t.advance();
  t.advance();
  const state = t.getSaveState();
  assert.ok(state.completedChapters.length >= 2);
  assert.equal(state.tutorialId, 'first-contact-introduction');

  const t2 = new TutorialRuntime();
  t2.restore(state);
  assert.equal(t2.currentChapterIndex, 2);
  assert.ok(t2.completedChapters.size >= 2);
});

test('TutorialRuntime: guidance mode in save state', () => {
  const t = new TutorialRuntime();
  t.setGuidanceMode('DETAILED');
  const state = t.getSaveState();
  assert.equal(state.guidanceMode, 'DETAILED');

  const t2 = new TutorialRuntime();
  t2.restore(state);
  assert.equal(t2.guidanceMode, 'DETAILED');
});

test('TutorialRuntime: dismiss concept', () => {
  const t = new TutorialRuntime();
  t.dismissConcept('some-concept');
  assert.ok(t.dismissedConcepts.has('some-concept'));
  assert.ok(!t.shouldShowConcept('some-concept'));
  assert.ok(t.shouldShowConcept('other-concept'));
});

test('TutorialRuntime: checkCompletion with action family', () => {
  const t = new TutorialRuntime();
  // Chapter 3 is 'draw-a-card' with acceptedFamily: 'draw'
  t.currentChapterIndex = 3;
  assert.ok(t.checkCompletion({ family: 'draw' }));
  assert.ok(!t.checkCompletion({ family: 'score' }));
});

test('TutorialRuntime: checkCompletion with acknowledge returns false', () => {
  const t = new TutorialRuntime();
  // Chapter 0 is 'welcome' with type: 'acknowledge'
  assert.ok(!t.checkCompletion({ family: 'draw' }));
});

test('TutorialRuntime: recommendedFamily', () => {
  const t = new TutorialRuntime();
  // Chapter 3 is 'draw-a-card' with recommendedAction.family: 'draw'
  t.currentChapterIndex = 3;
  assert.equal(t.recommendedFamily, 'draw');
});

// ─── Guidance Mode Tests ────────────────────────────────────────

test('GuidanceMode: has four modes', () => {
  assert.equal(GuidanceMode.OFF, 'OFF');
  assert.equal(GuidanceMode.ESSENTIAL, 'ESSENTIAL');
  assert.equal(GuidanceMode.GUIDED, 'GUIDED');
  assert.equal(GuidanceMode.DETAILED, 'DETAILED');
});

test('buildImmediateExplanation: OFF mode returns empty', () => {
  const result = buildImmediateExplanation({}, [], GuidanceMode.OFF);
  assert.equal(result.title, '');
  assert.equal(result.body, '');
});

test('buildImmediateExplanation: ESSENTIAL shows minimal info', () => {
  const ctx = { isHumanPriority: true, windowType: 'proactive', stackDepth: 0, canPass: false };
  const result = buildImmediateExplanation(ctx, [{ displayLabel: 'Draw', form: 'draw' }], GuidanceMode.ESSENTIAL);
  assert.ok(result.title);
});

test('buildWhyExplanation: OFF mode returns null', () => {
  const result = buildWhyExplanation({ displayLabel: 'Test' }, null, GuidanceMode.OFF);
  assert.equal(result, null);
});

test('buildUnavailableExplanation: OFF mode returns empty', () => {
  const result = buildUnavailableExplanation('NOT_PRIORITY_HOLDER', GuidanceMode.OFF);
  assert.equal(result.shortText, '');
});

test('buildUnavailableExplanation: ESSENTIAL returns short only', () => {
  const result = buildUnavailableExplanation('NOT_PRIORITY_HOLDER', GuidanceMode.ESSENTIAL);
  assert.ok(result.shortText);
  assert.equal(result.detailedText, '');
});

test('buildUnavailableExplanation: DETAILED returns full explanation', () => {
  const result = buildUnavailableExplanation('NOT_PRIORITY_HOLDER', GuidanceMode.DETAILED);
  assert.ok(result.shortText);
  assert.ok(result.detailedText);
  assert.ok(result.ruleRef);
});

// ─── Tutorial Source Structure Tests ────────────────────────────

test('tutorial-runtime: has guidance mode support', () => {
  assert.ok(tutorialSrc.includes('guidanceMode'), 'Must have guidanceMode field');
  assert.ok(tutorialSrc.includes('setGuidanceMode'), 'Must have setGuidanceMode method');
  assert.ok(tutorialSrc.includes('dismissConcept'), 'Must have dismissConcept method');
  assert.ok(tutorialSrc.includes('restart'), 'Must have restart method');
  assert.ok(tutorialSrc.includes('shouldShowConcept'), 'Must have shouldShowConcept method');
});

test('tutorial-runtime: has dismissedConcepts in save state', () => {
  assert.ok(tutorialSrc.includes('dismissedConcepts'), 'Must track dismissedConcepts');
});

// ─── Conservation Tests ─────────────────────────────────────────

test('CONSERVATION: tutorial state does not affect engine determinism', () => {
  const t = new TutorialRuntime();
  const state1 = t.getSaveState();
  // Change guidance mode and dismiss concepts
  t.setGuidanceMode('OFF');
  t.dismissConcept('test');
  const state2 = t.getSaveState();
  // The tutorialId, version, currentChapter, completedChapters should be the same
  // Only guidanceMode and dismissedConcepts changed (UI-only state)
  assert.equal(state1.tutorialId, state2.tutorialId);
  assert.equal(state1.currentChapter, state2.currentChapter);
  assert.deepEqual(state1.completedChapters, state2.completedChapters);
});

test('CONSERVATION: guidance mode never claims a move is best', () => {
  const tutorialText = getTutorialDefinition().chapters.map(c => c.text).join(' ');
  assert.ok(!tutorialText.toLowerCase().includes('best move'), 'Tutorial must not claim a move is best');
  assert.ok(!tutorialText.toLowerCase().includes('objectively best'), 'Tutorial must not claim objective best');
});
