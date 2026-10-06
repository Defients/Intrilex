// ═══════════════════════════════════════════════════════════════
// phase2-player-experience.test.mjs — Phase 2 PX tests
//
// Tests for:
//   A-01 — Academy as default onboarding (landing page CTA)
//   A-02 — Card Inspector as educational bridge
//   A-03 — Decision-intelligence tooltips
//   F-01 — Post-match teaching moments with next-step links
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderTeachingMoment } from '../packages/decision-intelligence/src/teaching-moments.mjs';

const appSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/app.js'), 'utf8');
const cardWsSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/workspaces/cards/card-workspace.js'), 'utf8');
const cardModelSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/workspaces/cards/card-model.js'), 'utf8');
const teachingSrc = readFileSync(join(process.cwd(), 'packages/decision-intelligence/src/teaching-moments.mjs'), 'utf8');
const landingRevampSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/css/landing-revamp.css'), 'utf8');
const rankedDuelCssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel.css'), 'utf8');
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
// A-02: CARD DOSSIER AS CANONICAL BRIDGE (Card Observatory rebuild)
//
// The old Card Reference derived "when to play" advice from timing
// keywords — pseudo-strategy that duplicated the Field Manual. The
// Card Observatory dossier keeps the educational bridge but grounds
// it in canonical sources: card-face-data + Advanced Card Rules, with
// an explicit legality note. No timing-derived advice may return.
// ═══════════════════════════════════════════════════════════════

test('A-02: dossier embeds the canonical Advanced Card Rules view', () => {
  assert.ok(cardWsSrc.includes('renderAdvancedCardRulesView'), 'Dossier must render the canonical ACR view');
  assert.ok(cardModelSrc.includes('getCardRulesDefinition'), 'Card model must read canonical rules definitions');
});

test('A-02: no timing-derived when-to-play guidance remains', () => {
  assert.ok(!cardWsSrc.includes('buildWhenToPlayGuidance'), 'Old when-to-play logic must be gone');
  assert.ok(!cardWsSrc.includes('when to play'), 'No when-to-play copy may be presented as strategy');
  assert.ok(!cardWsSrc.includes('card-ref-detail-guidance'), 'Old guidance section must be gone');
});

test('A-02: card dossier includes legality note', () => {
  assert.ok(cardWsSrc.includes('card-legality-note'), 'Card dossier must have a legality note');
  assert.ok(cardWsSrc.includes('data-testid="card-legality-note"'), 'Legality note must have testid');
});

test('A-02: dossier exposes canonical facts (PR, timing, authority)', () => {
  assert.ok(cardWsSrc.includes('identityTab'), 'Identity tab must exist');
  assert.ok(cardModelSrc.includes('timingClasses'), 'Card model must derive timing classes canonically');
  assert.ok(cardWsSrc.includes('CARD_FACE_REGISTRY_META'), 'Registry provenance must be shown');
});

test('A-02: dossier provides investigation links instead of pseudo-strategy', () => {
  assert.ok(cardWsSrc.includes('data-card-xref'), 'Cross-workspace links must exist');
  assert.ok(cardWsSrc.includes("#/strategy?subject="), 'Field Manual deep link must exist');
  assert.ok(cardModelSrc.includes('relationshipsFor'), 'Relationship model must exist');
});

test('A-02: cards workspace CSS exists', () => {
  const cardsCss = readFileSync(join(process.cwd(), 'apps/lab-web/src/css/cards.css'), 'utf8');
  assert.ok(cardsCss.includes('.card-dossier'), 'CSS must have dossier styles');
  assert.ok(cardsCss.includes('.card-atlas'), 'CSS must have atlas styles');
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
