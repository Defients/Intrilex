// ═══════════════════════════════════════════════════════════════
// learning-loop.test.mjs — Stage 3 tests
//
// Tests for:
//   L3 — Post-match teaching moments
//   L7 — Beginner-trap diagnostics
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

const terminalSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-terminal.mjs'), 'utf8');
const teachingSrc = readFileSync(join(process.cwd(), 'packages/decision-intelligence/src/teaching-moments.mjs'), 'utf8');
const pkgSrc = readFileSync(join(process.cwd(), 'packages/decision-intelligence/package.json'), 'utf8');

// ═══════════════════════════════════════════════════════════════
// L3: POST-MATCH TEACHING MOMENTS
// ═══════════════════════════════════════════════════════════════

test('L3 Module: exports generateTeachingMoment', () => {
  assert.ok(typeof generateTeachingMoment === 'function');
});

test('L3 Module: exports renderTeachingMoment', () => {
  assert.ok(typeof renderTeachingMoment === 'function');
});

test('L3 Module: generateTeachingMoment returns null for empty vm', () => {
  assert.equal(generateTeachingMoment(null), null);
  assert.equal(generateTeachingMoment(undefined), null);
  assert.equal(generateTeachingMoment({}), null);
});

test('L3 Module: generateTeachingMoment detects early termination', () => {
  const vm = {
    match: { fullTurnSequence: 4, terminationReason: 'GOAL_REACHED', winner: 'P2' },
    human: { secured: 3, goal: 21, playerId: 'P1' },
    opponent: { secured: 8, goal: 21 },
    zones: { drawPile: { count: 30 } },
  };
  const moment = generateTeachingMoment(vm);
  assert.ok(moment);
  assert.equal(moment.category, 'tempo');
  assert.ok(moment.title.includes('Early'));
});

test('L3 Module: generateTeachingMoment detects large IR margin loss', () => {
  const vm = {
    match: { fullTurnSequence: 15, terminationReason: 'GOAL_REACHED', winner: 'P2' },
    human: { secured: 5, goal: 21, playerId: 'P1' },
    opponent: { secured: 18, goal: 21 },
    zones: { drawPile: { count: 10 } },
  };
  const moment = generateTeachingMoment(vm);
  assert.ok(moment);
  assert.ok(moment.insight.includes('trailed'));
});

test('L3 Module: generateTeachingMoment detects dominant win', () => {
  const vm = {
    match: { fullTurnSequence: 15, terminationReason: 'GOAL_REACHED', winner: 'P1' },
    human: { secured: 20, goal: 21, playerId: 'P1' },
    opponent: { secured: 5, goal: 21 },
    zones: { drawPile: { count: 10 } },
  };
  const moment = generateTeachingMoment(vm);
  assert.ok(moment);
  assert.ok(moment.insight.includes('commanding') || moment.insight.includes('won'));
});

test('L3 Module: generateTeachingMoment detects deck exhaustion', () => {
  const vm = {
    match: { fullTurnSequence: 20, terminationReason: 'DECK_EXHAUSTED', winner: 'P1' },
    human: { secured: 15, goal: 21, playerId: 'P1', cardsDrawn: 40 },
    opponent: { secured: 10, goal: 21 },
    zones: { drawPile: { count: 0 } },
  };
  const moment = generateTeachingMoment(vm);
  assert.ok(moment);
  assert.ok(moment.title.includes('Deck') || moment.title.includes('Exhaustion'));
});

test('L3 Module: generateTeachingMoment detects close loss', () => {
  const vm = {
    match: { fullTurnSequence: 18, terminationReason: 'GOAL_REACHED', winner: 'P2' },
    human: { secured: 18, goal: 21, playerId: 'P1' },
    opponent: { secured: 21, goal: 21 },
    zones: { drawPile: { count: 5 } },
  };
  const moment = generateTeachingMoment(vm);
  assert.ok(moment);
  assert.ok(moment.title.includes('So Close') || moment.insight.includes('80%'));
});

test('L3 Module: renderTeachingMoment returns HTML', () => {
  const moment = {
    title: 'Test Insight',
    insight: 'This is a test observation.',
    tip: 'Try this next time.',
    category: 'tempo',
  };
  const html = renderTeachingMoment(moment);
  assert.ok(html.includes('teaching-moment'));
  assert.ok(html.includes('Test Insight'));
  assert.ok(html.includes('test observation'));
  assert.ok(html.includes('Try this next time'));
});

test('L3 Module: renderTeachingMoment returns empty for null', () => {
  assert.equal(renderTeachingMoment(null), '');
});

test('L3 Terminal: imports teaching moments', () => {
  assert.ok(terminalSrc.includes('generateTeachingMoment'), 'Terminal must import generateTeachingMoment');
  assert.ok(terminalSrc.includes('generateBeginnerTrapTip'), 'Terminal must import generateBeginnerTrapTip');
  assert.ok(terminalSrc.includes('renderTeachingMoment'), 'Terminal must import renderTeachingMoment');
});

test('L3 Terminal: renders teaching moment after intelligence card', () => {
  assert.ok(terminalSrc.includes('renderTeachingMoment(generateTeachingMoment(vm) || generateBeginnerTrapTip(vm))'),
    'Terminal must render teaching moment after intelligence card');
});

test('L3 Package: exports teaching-moments from package.json', () => {
  assert.ok(pkgSrc.includes('./teaching-moments'), 'package.json must export teaching-moments');
});

// ═══════════════════════════════════════════════════════════════
// L7: BEGINNER-TRAP DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════

test('L7 Module: exports generateBeginnerTrapTip', () => {
  assert.ok(typeof generateBeginnerTrapTip === 'function');
});

test('L7 Module: generateBeginnerTrapTip returns null for empty vm', () => {
  assert.equal(generateBeginnerTrapTip(null), null);
  assert.equal(generateBeginnerTrapTip({}), null);
});

test('L7 Module: detects excessive passing', () => {
  const vm = {
    match: { fullTurnSequence: 10, winner: 'P2' },
    human: { passes: 5, secured: 5, goal: 21, playerId: 'P1' },
    opponent: { secured: 15, goal: 21 },
    zones: { drawPile: { count: 15 } },
  };
  const tip = generateBeginnerTrapTip(vm);
  assert.ok(tip);
  assert.ok(tip.title.includes('Passing'));
  assert.ok(tip.tip.includes('pass'));
});

test('L7 Module: detects low card usage', () => {
  const vm = {
    match: { fullTurnSequence: 12, winner: 'P2' },
    human: { cardsPlayed: 3, passes: 1, secured: 5, goal: 21, playerId: 'P1' },
    opponent: { secured: 15, goal: 21, cardsPlayed: 10 },
    zones: { drawPile: { count: 10 } },
  };
  const tip = generateBeginnerTrapTip(vm);
  assert.ok(tip);
  assert.ok(tip.title.includes('Underutilizing') || tip.title.includes('Card'));
});

test('L7 Module: detects slow start', () => {
  const vm = {
    match: { fullTurnSequence: 4, winner: 'P2' },
    human: { secured: 1, passes: 0, goal: 21, playerId: 'P1', cardsPlayed: 2 },
    opponent: { secured: 8, goal: 21, cardsPlayed: 5 },
    zones: { drawPile: { count: 25 } },
  };
  const tip = generateBeginnerTrapTip(vm);
  assert.ok(tip);
  assert.ok(tip.title.includes('Slow Start') || tip.title.includes('Early'));
});

test('L7 Module: detects no countering', () => {
  const vm = {
    match: { fullTurnSequence: 15, winner: 'P2' },
    human: { counters: 0, passes: 1, secured: 8, goal: 21, playerId: 'P1', cardsPlayed: 8 },
    opponent: { secured: 18, goal: 21, cardsPlayed: 8 },
    zones: { drawPile: { count: 10 } },
  };
  const tip = generateBeginnerTrapTip(vm);
  assert.ok(tip);
  assert.ok(tip.title.includes('Counter') || tip.title.includes('Not Countering'));
});
