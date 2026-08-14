// ═══════════════════════════════════════════════════════════════
// intelligence-mastery.test.mjs — Stage 4 tests
//
// Tests for:
//   G2 — Mastery tracks (per-mechanic progression)
//   L6 — Replay-guided lesson mode
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  MASTERY_TIERS,
  getMasteryTier,
  getMasteryProgress,
  computeMasteryTracks,
  getTopMasteryTracks,
  renderMasteryTrack,
  renderMasterySection,
} from '../packages/decision-intelligence/src/mastery-tracks.mjs';

import {
  generateReplayLesson,
  countCommentedSteps,
  getLessonSummary,
  renderLessonStep,
} from '../packages/decision-intelligence/src/replay-lesson.mjs';

const pkgSrc = readFileSync(join(process.cwd(), 'packages/decision-intelligence/package.json'), 'utf8');

// ═══════════════════════════════════════════════════════════════
// G2: MASTERY TRACKS
// ═══════════════════════════════════════════════════════════════

test('G2: MASTERY_TIERS has 5 tiers', () => {
  assert.equal(MASTERY_TIERS.length, 5);
  assert.equal(MASTERY_TIERS[0].id, 'NOVICE');
  assert.equal(MASTERY_TIERS[4].id, 'MASTER');
});

test('G2: getMasteryTier returns NOVICE for 0 uses', () => {
  assert.equal(getMasteryTier(0).id, 'NOVICE');
});

test('G2: getMasteryTier returns APPRENTICE for 5 uses', () => {
  assert.equal(getMasteryTier(5).id, 'APPRENTICE');
});

test('G2: getMasteryTier returns ADEPT for 15 uses', () => {
  assert.equal(getMasteryTier(15).id, 'ADEPT');
});

test('G2: getMasteryTier returns EXPERT for 40 uses', () => {
  assert.equal(getMasteryTier(40).id, 'EXPERT');
});

test('G2: getMasteryTier returns MASTER for 100 uses', () => {
  assert.equal(getMasteryTier(100).id, 'MASTER');
});

test('G2: getMasteryProgress calculates progress to next tier', () => {
  const prog = getMasteryProgress(10); // Between APPRENTICE(5) and ADEPT(15)
  assert.equal(prog.current.id, 'APPRENTICE');
  assert.equal(prog.next.id, 'ADEPT');
  assert.ok(prog.progress > 0 && prog.progress < 1);
  assert.equal(prog.remaining, 5);
});

test('G2: getMasteryProgress returns 1 at max tier', () => {
  const prog = getMasteryProgress(200);
  assert.equal(prog.current.id, 'MASTER');
  assert.equal(prog.next, null);
  assert.equal(prog.progress, 1);
  assert.equal(prog.remaining, 0);
});

test('G2: computeMasteryTracks returns tracks for eligible mechanics', () => {
  const tracks = computeMasteryTracks({ scuttle: 10, draw: 20 });
  assert.ok(tracks.length > 0);
  const scuttleTrack = tracks.find(t => t.mechanicId === 'scuttle');
  assert.ok(scuttleTrack);
  assert.equal(scuttleTrack.uses, 10);
  assert.equal(scuttleTrack.currentTier.id, 'APPRENTICE');
});

test('G2: computeMasteryTracks handles empty usage', () => {
  const tracks = computeMasteryTracks({});
  assert.ok(tracks.length > 0);
  for (const t of tracks) {
    assert.equal(t.uses, 0);
    assert.equal(t.currentTier.id, 'NOVICE');
  }
});

test('G2: getTopMasteryTracks sorts by uses descending', () => {
  const tracks = getTopMasteryTracks({ scuttle: 10, draw: 50, 'effect-five': 3 }, 2);
  assert.equal(tracks.length, 2);
  assert.ok(tracks[0].uses >= tracks[1].uses);
});

test('G2: renderMasteryTrack produces HTML', () => {
  const track = {
    mechanicId: 'scuttle',
    mechanicName: 'Scuttle',
    category: 'control',
    uses: 10,
    currentTier: { id: 'APPRENTICE', name: 'Apprentice', threshold: 5, description: '' },
    nextTier: { id: 'ADEPT', name: 'Adept', threshold: 15, description: '' },
    progress: 0.5,
    remaining: 5,
  };
  const html = renderMasteryTrack(track);
  assert.ok(html.includes('mastery-track'));
  assert.ok(html.includes('Scuttle'));
  assert.ok(html.includes('Apprentice'));
});

test('G2: renderMasterySection produces HTML section', () => {
  const html = renderMasterySection({ scuttle: 10, draw: 50 });
  assert.ok(html.includes('mastery-section'));
  assert.ok(html.includes('Mechanic Mastery'));
});

test('G2: package.json exports mastery-tracks', () => {
  assert.ok(pkgSrc.includes('./mastery-tracks'), 'package.json must export mastery-tracks');
});

// ═══════════════════════════════════════════════════════════════
// L6: REPLAY-GUIDED LESSON MODE
// ═══════════════════════════════════════════════════════════════

test('L6: generateReplayLesson returns empty for null replay', () => {
  assert.equal(generateReplayLesson(null).length, 0);
  assert.equal(generateReplayLesson({}).length, 0);
});

test('L6: generateReplayLesson produces steps from commands', () => {
  const replay = {
    commands: [
      { turn: 1, playerId: 'P1', action: 'play-for-points', payload: { card: '7♠' } },
      { turn: 1, playerId: 'P2', action: 'draw', payload: {} },
      { turn: 2, playerId: 'P1', action: 'scuttle', payload: { card: 'K♦' } },
    ],
  };
  const steps = generateReplayLesson(replay);
  assert.equal(steps.length, 3);
  assert.ok(steps[0].commentary); // Opening move should have commentary
});

test('L6: generateReplayLesson adds commentary for opening move', () => {
  const replay = {
    commands: [
      { turn: 1, playerId: 'P1', action: 'play-for-points', payload: { card: '7♠' } },
    ],
  };
  const steps = generateReplayLesson(replay);
  assert.ok(steps[0].commentary);
  assert.ok(steps[0].commentary.includes('opens'));
});

test('L6: generateReplayLesson adds commentary for scuttle', () => {
  const replay = {
    commands: [
      { turn: 1, playerId: 'P1', action: 'play-for-points', payload: {} },
      { turn: 1, playerId: 'P2', action: 'play-for-points', payload: {} },
      { turn: 2, playerId: 'P1', action: 'scuttle', payload: { card: 'K♦' } },
    ],
  };
  const steps = generateReplayLesson(replay);
  const scuttleStep = steps[2];
  assert.ok(scuttleStep.commentary);
  assert.ok(scuttleStep.commentary.includes('scuttle'));
  assert.equal(scuttleStep.mechanicId, 'scuttle');
});

test('L6: generateReplayLesson adds commentary for effect cards', () => {
  const replay = {
    commands: [
      { turn: 1, playerId: 'P1', action: 'draw', payload: {} },
      { turn: 1, playerId: 'P2', action: 'draw', payload: {} },
      { turn: 2, playerId: 'P1', action: 'effect-five', payload: { card: '5♥' } },
    ],
  };
  const steps = generateReplayLesson(replay);
  const effectStep = steps[2];
  assert.ok(effectStep.commentary);
  assert.ok(effectStep.commentary.includes('Disrupt') || effectStep.commentary.includes('effect'));
  assert.equal(effectStep.mechanicId, 'effect-five');
});

test('L6: countCommentedSteps counts non-null commentary', () => {
  const steps = [
    { commentary: 'test', mechanicId: null, phase: 'ACTION', index: 0, command: {} },
    { commentary: null, mechanicId: null, phase: 'ACTION', index: 1, command: {} },
    { commentary: 'test2', mechanicId: null, phase: 'ACTION', index: 2, command: {} },
  ];
  assert.equal(countCommentedSteps(steps), 2);
});

test('L6: getLessonSummary returns summary', () => {
  const steps = [
    { commentary: 'a', mechanicId: 'scuttle', phase: 'ACTION', index: 0, command: {} },
    { commentary: null, mechanicId: 'draw', phase: 'ACTION', index: 1, command: {} },
  ];
  const summary = getLessonSummary(steps);
  assert.equal(summary.totalSteps, 2);
  assert.equal(summary.commentedSteps, 1);
  assert.ok(summary.mechanics.includes('scuttle'));
  assert.ok(summary.mechanics.includes('draw'));
});

test('L6: renderLessonStep produces HTML', () => {
  const step = {
    index: 0,
    command: { turn: 1, playerId: 'P1', action: 'play-for-points' },
    commentary: 'Player 1 opens with a scoring play.',
    mechanicId: 'play-for-points',
    phase: 'ACTION',
  };
  const html = renderLessonStep(step);
  assert.ok(html.includes('replay-lesson-step'));
  assert.ok(html.includes('replay-lesson-commentary'));
  assert.ok(html.includes('play-for-points'));
});

test('L6: renderLessonStep handles null commentary', () => {
  const step = {
    index: 1,
    command: { turn: 1, playerId: 'P2', action: 'draw' },
    commentary: null,
    mechanicId: 'draw',
    phase: 'ACTION',
  };
  const html = renderLessonStep(step);
  assert.ok(html.includes('replay-lesson-step'));
  assert.ok(!html.includes('replay-lesson-commentary'));
});

test('L6: package.json exports replay-lesson', () => {
  assert.ok(pkgSrc.includes('./replay-lesson'), 'package.json must export replay-lesson');
});
