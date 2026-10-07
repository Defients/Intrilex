// ═══════════════════════════════════════════════════════════════
// phase2-player-experience.test.mjs — Phase 2 PX tests
//
// Tests for:
//   A-01 — Academy onboarding (homepage hero link)
//   A-02 — Card Inspector as educational bridge
//   A-03 — Decision-intelligence tooltips
//   F-01 — Post-match teaching moments with next-step links
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderTeachingMoment } from '../packages/decision-intelligence/src/teaching-moments.mjs';

const homeViewSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/home/home-view.js'), 'utf8');
const cardWsSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/workspaces/cards/card-workspace.js'), 'utf8');
const cardModelSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/workspaces/cards/card-model.js'), 'utf8');
const teachingSrc = readFileSync(join(process.cwd(), 'packages/decision-intelligence/src/teaching-moments.mjs'), 'utf8');
const rankedDuelCssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel.css'), 'utf8');
// ═══════════════════════════════════════════════════════════════
// A-01: ACADEMY ONBOARDING ON THE HOMEPAGE
//
// The homepage hero routes new players to the Academy and reads the
// rules — onboarding is a real path, not a funnel-state fork. The
// retired WIP page's localStorage visitor segmentation was removed
// with it; Academy discoverability is what must hold.
// ═══════════════════════════════════════════════════════════════

test('A-01: homepage links to the Academy for new players', () => {
  assert.ok(homeViewSrc.includes('#/play/academy'), 'Homepage must link to the Academy');
  assert.ok(homeViewSrc.includes('Start with the Academy'), 'Academy link must be presented as the new-player path');
});

test('A-01: homepage primary nav exposes LEARN → Academy', () => {
  assert.ok(homeViewSrc.includes("href: '#/play/academy'"), 'Primary nav must route LEARN to the Academy');
  assert.ok(homeViewSrc.includes("label: 'LEARN'"), 'Primary nav must have a LEARN item');
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
