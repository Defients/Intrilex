// ═══════════════════════════════════════════════════════════════
// phase2-player-experience.test.mjs — Phase 2 PX tests
//
// Tests for:
//   A-01 — Academy as default onboarding (landing page CTA)
//   A-02 — Card Inspector as educational bridge
//   A-03 — Decision-intelligence tooltips
//   A-05 — 2D Brain as default visualization
//   F-01 — Post-match teaching moments with next-step links
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  generateTeachingMoment,
  generateBeginnerTrapTip,
  renderTeachingMoment,
} from '../packages/decision-intelligence/src/teaching-moments.mjs';

const appSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/app.js'), 'utf8');
const cardRefSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/workspaces/card-reference.js'), 'utf8');
const brainCtrlSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/brain/brain-controller.js'), 'utf8');
const brainFallbackSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/brain/brain-fallback.js'), 'utf8');
const brain2dSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/brain/brain-2d.js'), 'utf8');
const teachingSrc = readFileSync(join(process.cwd(), 'packages/decision-intelligence/src/teaching-moments.mjs'), 'utf8');
const landingRevampSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/css/landing-revamp.css'), 'utf8');
const brainCssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/css/brain.css'), 'utf8');
const rankedDuelCssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel.css'), 'utf8');
const featureComponentsSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/css/feature-components.css'), 'utf8');

// ═══════════════════════════════════════════════════════════════
// A-01: ACADEMY AS DEFAULT ONBOARDING
// ═══════════════════════════════════════════════════════════════

test('A-01: detectVisitorState function exists in app.js', () => {
  assert.ok(appSrc.includes('function detectVisitorState'), 'detectVisitorState must exist');
});

test('A-01: renderPlayCtaSection function exists in app.js', () => {
  assert.ok(appSrc.includes('function renderPlayCtaSection'), 'renderPlayCtaSection must exist');
});

test('A-01: landing page renders play CTA section', () => {
  assert.ok(appSrc.includes('${renderPlayCtaSection()}'), 'Landing page must call renderPlayCtaSection()');
});

test('A-01: first-time visitor gets Academy as primary CTA', () => {
  assert.ok(appSrc.includes("state === 'first-time'"), 'Must handle first-time state');
  assert.ok(appSrc.includes('Learn with Academy'), 'First-time CTA must mention Academy');
});

test('A-01: returning-incomplete visitor gets Continue Academy CTA', () => {
  assert.ok(appSrc.includes("state === 'returning-incomplete'"), 'Must handle returning-incomplete state');
  assert.ok(appSrc.includes('Continue Academy'), 'Returning-incomplete CTA must say Continue Academy');
});

test('A-01: returning-complete visitor gets Play Now CTA', () => {
  // returning-complete is the fallthrough case in renderPlayCtaSection
  assert.ok(appSrc.includes("returning-complete"), 'Must handle returning-complete state');
  assert.ok(appSrc.includes('Play Intrilex'), 'Returning-complete CTA must say Play Intrilex');
});

test('A-01: visitor state checks localStorage keys', () => {
  assert.ok(appSrc.includes("intrilex:funnel-state"), 'Must check funnel state key');
  assert.ok(appSrc.includes("intrilex:academy-progress-v2"), 'Must check academy progress key');
});

test('A-01: academyTotal guards against zero', () => {
  assert.ok(appSrc.includes('Math.max(1, lessons.length)'), 'academyTotal must guard against 0');
});

test('A-01: CSS has play CTA styles', () => {
  assert.ok(landingRevampSrc.includes('.wip-play-cta'), 'CSS must have .wip-play-cta');
  assert.ok(landingRevampSrc.includes('.wip-play-cta-primary'), 'CSS must have .wip-play-cta-primary');
  assert.ok(landingRevampSrc.includes('.wip-play-cta-secondary'), 'CSS must have .wip-play-cta-secondary');
});

test('A-01: CSS has reduced-motion support for play CTA', () => {
  assert.ok(landingRevampSrc.includes('.wip-play-cta') && landingRevampSrc.includes('prefers-reduced-motion'),
    'Play CTA must be in reduced-motion media query');
});

// ═══════════════════════════════════════════════════════════════
// A-02: CARD INSPECTOR AS EDUCATIONAL BRIDGE
// ═══════════════════════════════════════════════════════════════

test('A-02: buildWhenToPlayGuidance function exists', () => {
  assert.ok(cardRefSrc.includes('function buildWhenToPlayGuidance'), 'buildWhenToPlayGuidance must exist');
});

test('A-02: buildScoringSummary function exists', () => {
  assert.ok(cardRefSrc.includes('function buildScoringSummary'), 'buildScoringSummary must exist');
});

test('A-02: card detail includes when-to-play guidance section', () => {
  assert.ok(cardRefSrc.includes('card-ref-detail-guidance'), 'Card detail must have guidance section');
  assert.ok(cardRefSrc.includes('data-testid="card-ref-guidance"'), 'Guidance must have testid');
});

test('A-02: card detail includes scoring summary', () => {
  assert.ok(cardRefSrc.includes('card-ref-scoring-summary'), 'Card detail must have scoring summary');
  assert.ok(cardRefSrc.includes('data-testid="card-ref-scoring"'), 'Scoring summary must have testid');
});

test('A-02: card detail includes legality note', () => {
  assert.ok(cardRefSrc.includes('card-ref-detail-legality-note'), 'Card detail must have legality note');
  assert.ok(cardRefSrc.includes('data-testid="card-ref-legality-note"'), 'Legality note must have testid');
});

test('A-02: card detail includes Academy and Free Play CTAs', () => {
  assert.ok(cardRefSrc.includes('data-testid="card-ref-cta-academy"'), 'Must have Academy CTA');
  assert.ok(cardRefSrc.includes('data-testid="card-ref-cta-play"'), 'Must have Free Play CTA');
});

test('A-02: timing keyword matching covers all timing types', () => {
  // All timing types from card-face-data.js: Instant, Anchor mode, Anchor · Attachment,
  // Effect, Interrupt, Multi-card Rank-10 play, Action · multi-card, Passive, Quick,
  // Quick Effect, Scoring trigger, Scoring rider, Super
  assert.ok(cardRefSrc.includes("timing.includes('Instant')"), 'Must handle Instant');
  assert.ok(cardRefSrc.includes("timing.includes('Interrupt')"), 'Must handle Interrupt');
  assert.ok(cardRefSrc.includes("timing.includes('Anchor')"), 'Must handle Anchor');
  assert.ok(cardRefSrc.includes("timing.includes('Scoring')"), 'Must handle Scoring');
  assert.ok(cardRefSrc.includes("timing.includes('Super')"), 'Must handle Super');
  assert.ok(cardRefSrc.includes("timing.includes('Quick')"), 'Must handle Quick');
  assert.ok(cardRefSrc.includes("timing.includes('Passive')"), 'Must handle Passive');
  assert.ok(cardRefSrc.includes("timing.includes('Effect')"), 'Must handle Effect');
  // Case-insensitive multi-card matching
  assert.ok(cardRefSrc.includes("timingLower.includes('multi-card')"), 'Must handle multi-card case-insensitively');
});

test('A-02: CSS has guidance and legality styles', () => {
  assert.ok(featureComponentsSrc.includes('.card-ref-detail-guidance'), 'CSS must have guidance styles');
  assert.ok(featureComponentsSrc.includes('.card-ref-detail-legality-note'), 'CSS must have legality note styles');
  assert.ok(featureComponentsSrc.includes('.card-ref-cta-btn'), 'CSS must have CTA button styles');
});

// ═══════════════════════════════════════════════════════════════
// A-03: DECISION-INTELLIGENCE TOOLTIPS
// ═══════════════════════════════════════════════════════════════

test('A-03: CSS has tooltip styles', () => {
  assert.ok(rankedDuelCssSrc.includes('.rd-card-tooltip'), 'CSS must have .rd-card-tooltip');
  assert.ok(rankedDuelCssSrc.includes('.rd-card:hover .rd-card-tooltip'), 'CSS must show tooltip on hover');
  assert.ok(rankedDuelCssSrc.includes('.rd-card.no-legal-actions .rd-card-tooltip'), 'CSS must style illegal card tooltips differently');
});

// ═══════════════════════════════════════════════════════════════
// A-05: 2D BRAIN AS DEFAULT
// ═══════════════════════════════════════════════════════════════

test('A-05: getBrainMode function exists', () => {
  assert.ok(brainCtrlSrc.includes('export function getBrainMode'), 'getBrainMode must be exported');
});

test('A-05: setBrainMode function exists', () => {
  assert.ok(brainCtrlSrc.includes('export function setBrainMode'), 'setBrainMode must be exported');
});

test('A-05: brain mode defaults to 2d', () => {
  assert.ok(brainCtrlSrc.includes("return '2d'"), 'Default mode must be 2d');
});

test('A-05: brain mode persisted in localStorage', () => {
  assert.ok(brainCtrlSrc.includes("intrilex:brain-mode"), 'Must use intrilex:brain-mode key');
});

test('A-05: initBrain checks brain mode before loading 3D', () => {
  assert.ok(brainCtrlSrc.includes('getBrainMode()'), 'initBrain must call getBrainMode()');
  assert.ok(brainCtrlSrc.includes("brainMode === '2d'"), 'Must branch on 2d mode');
});

test('A-05: 2D mode renders fallback with toggle', () => {
  assert.ok(brainCtrlSrc.includes('showToggle: true'), '2D mode must show toggle');
});

test('A-05: 3D mode has Switch to 2D toggle', () => {
  assert.ok(brainCtrlSrc.includes('brain-mode-toggle--2d'), '3D mode must have 2D toggle button');
  assert.ok(brainCtrlSrc.includes('Switch to 2D'), '3D mode must have Switch to 2D text');
});

test('A-05: WebGL context loss resets mode to 2d', () => {
  assert.ok(brainCtrlSrc.includes("setBrainMode('2d')"), 'Context loss must reset mode to 2d');
});

test('A-05: brain-2d.js lightweight module exists', () => {
  assert.ok(brain2dSrc.includes('export function init2dBrain'), 'brain-2d.js must export init2dBrain');
  assert.ok(!brain2dSrc.includes('three'), 'brain-2d.js must not import three.js');
  assert.ok(!brain2dSrc.includes('createScene'), 'brain-2d.js must not import brain-scene');
});

test('A-05: brain-2d.js uses same data modules as brain-controller', () => {
  assert.ok(brain2dSrc.includes('brain-data.js'), 'Must import brain-data.js');
  assert.ok(brain2dSrc.includes('brain-fallback.js'), 'Must import brain-fallback.js');
});

test('A-05: app.js uses 2D brain by default', () => {
  assert.ok(appSrc.includes('get2dBrain'), 'app.js must have 2D brain lazy loader');
  assert.ok(appSrc.includes("brainMode === '3d'"), 'app.js must branch on 3D mode');
  assert.ok(appSrc.includes('brain:switch-mode'), 'app.js must listen for mode switch event');
});

test('A-05: renderFallback supports showToggle option', () => {
  assert.ok(brainFallbackSrc.includes('opts = {}'), 'renderFallback must accept opts');
  assert.ok(brainFallbackSrc.includes('opts.showToggle'), 'Must check showToggle option');
  assert.ok(brainFallbackSrc.includes('brain-mode-toggle--3d'), 'Must render 3D toggle button');
});

test('A-05: CSS has brain mode toggle styles', () => {
  assert.ok(brainCssSrc.includes('.brain-mode-toggle'), 'CSS must have .brain-mode-toggle');
  assert.ok(brainCssSrc.includes('.brain-mode-toggle:hover'), 'CSS must have hover state');
});

// ═══════════════════════════════════════════════════════════════
// F-01: POST-MATCH TEACHING MOMENTS WITH NEXT-STEP LINKS
// ═══════════════════════════════════════════════════════════════

test('F-01: renderTeachingMoment includes next-steps section', () => {
  const moment = {
    title: 'Test',
    insight: 'Test insight.',
    tip: 'Test tip.',
    category: 'tempo',
  };
  const html = renderTeachingMoment(moment);
  assert.ok(html.includes('teaching-moment-next'), 'Must have next-steps section');
  assert.ok(html.includes('data-testid="teaching-moment-next"'), 'Next-steps must have testid');
});

test('F-01: next-steps include Academy links', () => {
  const moment = { title: 'T', insight: 'I', tip: 'T', category: 'tempo' };
  const html = renderTeachingMoment(moment);
  assert.ok(html.includes('#/play/academy'), 'Tempo category must link to Academy');
});

test('F-01: next-steps include puzzle links', () => {
  const moment = { title: 'T', insight: 'I', tip: 'T', category: 'defense' };
  const html = renderTeachingMoment(moment);
  assert.ok(html.includes('#/puzzles'), 'Must link to puzzles');
});

test('F-01: next-steps are category-specific', () => {
  const tempoHtml = renderTeachingMoment({ title: 'T', insight: 'I', tip: 'T', category: 'tempo' });
  const defenseHtml = renderTeachingMoment({ title: 'T', insight: 'I', tip: 'T', category: 'defense' });
  // Both should have Academy links but with different lesson labels
  assert.ok(tempoHtml.includes('Draw & Score'), 'Tempo should link to Draw & Score lesson');
  assert.ok(defenseHtml.includes('Respond & Counter'), 'Defense should link to Respond & Counter lesson');
});

test('F-01: next-steps have individual testids', () => {
  const html = renderTeachingMoment({ title: 'T', insight: 'I', tip: 'T', category: 'efficiency' });
  assert.ok(html.includes('data-testid="teaching-moment-next-step"'), 'Each step must have testid');
});

test('F-01: nextStepsForCategory handles unknown categories', () => {
  const html = renderTeachingMoment({ title: 'T', insight: 'I', tip: 'T', category: 'unknown' });
  assert.ok(html.includes('#/play/academy'), 'Unknown category should default to Academy link');
});

test('F-01: nextStepsForCategory covers all teaching moment categories', () => {
  // The teaching-moments module uses: tempo, defense, efficiency, positioning
  for (const cat of ['tempo', 'defense', 'efficiency', 'positioning']) {
    const html = renderTeachingMoment({ title: 'T', insight: 'I', tip: 'T', category: cat });
    assert.ok(html.includes('teaching-moment-next-step'), `Category ${cat} must have next-step links`);
  }
});

test('F-01: teaching-moments source has nextStepsForCategory', () => {
  assert.ok(teachingSrc.includes('function nextStepsForCategory'), 'Source must have nextStepsForCategory');
});

test('F-01: CSS has teaching moment next-step styles', () => {
  assert.ok(rankedDuelCssSrc.includes('.teaching-moment-next'), 'CSS must have next-steps styles');
  assert.ok(rankedDuelCssSrc.includes('.teaching-moment-next-step'), 'CSS must have next-step link styles');
});
