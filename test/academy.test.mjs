// ═══════════════════════════════════════════════════════════════
// academy.test.mjs — Academy 1.0 tutorial tests
//
// Tests the Academy renderer, lesson definitions, progress tracking,
// and route integration.
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const academySrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/academy/academy-renderer.mjs'), 'utf8');
const playAppSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-app.js'), 'utf8');
const routerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/router.js'), 'utf8');
const hubSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-hub.mjs'), 'utf8');
const seoSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/seo-metadata.js'), 'utf8');
const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-v3.css'), 'utf8');

// ── Lesson definitions ──

test('Academy: ACADEMY_LESSONS has 5 lessons', () => {
  assert.ok(
    academySrc.includes('ACADEMY_LESSONS'),
    'Academy renderer must export ACADEMY_LESSONS'
  );
  // Count lesson objects by counting 'id:' fields in the array
  const lessonCount = (academySrc.match(/id:\s*'[^']+',\s*\n\s*title:/g) || []).length;
  assert.ok(lessonCount >= 5, `Must have at least 5 lessons (found ${lessonCount})`);
});

test('Academy: lessons cover core mechanics', () => {
  assert.ok(academySrc.includes('draw-and-score'), 'Must have Draw & Score lesson');
  assert.ok(academySrc.includes('card-effects'), 'Must have Card Effects lesson');
  assert.ok(academySrc.includes('respond-and-counter'), 'Must have Respond & Counter lesson');
  assert.ok(academySrc.includes('royal-cards'), 'Must have Royal Cards lesson');
  assert.ok(academySrc.includes('win-the-game'), 'Must have Win the Game lesson');
});

test('Academy: each lesson has objectives and aiPolicy', () => {
  assert.ok(
    academySrc.includes('objectives:') && academySrc.includes('aiPolicy:'),
    'Each lesson must have objectives and aiPolicy fields'
  );
  // All lessons should use easy AI policies
  assert.ok(
    academySrc.includes('-easy'),
    'Lessons should use easy AI policies for beginner practice'
  );
});

test('Academy: all lessons use first-contact profile', () => {
  // The startAcademyLesson function in play-app.js should use first-contact-trigger-closure
  assert.ok(
    playAppSrc.includes("'first-contact-trigger-closure'"),
    'Academy lessons must use the first-contact-trigger-closure profile'
  );
});

// ── Progress tracking ──

test('Academy: progress tracking functions exist', () => {
  assert.ok(
    academySrc.includes('export function getCompletedLessons'),
    'Must export getCompletedLessons'
  );
  assert.ok(
    academySrc.includes('export function markLessonComplete'),
    'Must export markLessonComplete'
  );
  assert.ok(
    academySrc.includes("localStorage.getItem('intrilex:academy-progress')"),
    'Progress must be stored in localStorage under intrilex:academy-progress'
  );
});

test('Academy: markLessonComplete avoids duplicates', () => {
  assert.ok(
    academySrc.includes('!completed.includes(lessonId)'),
    'markLessonComplete must check for duplicates before adding'
  );
});

// ── Renderer ──

test('Academy: renderAcademy function exists', () => {
  assert.ok(
    academySrc.includes('export function renderAcademy'),
    'Must export renderAcademy'
  );
  assert.ok(
    academySrc.includes('data-testid="academy"'),
    'renderAcademy must have data-testid="academy"'
  );
});

test('Academy: renderer shows progress bar', () => {
  assert.ok(
    academySrc.includes('data-testid="academy-progress"'),
    'Renderer must show progress bar'
  );
  assert.ok(
    academySrc.includes('academy-progress-fill'),
    'Progress bar must have fill element'
  );
});

test('Academy: renderer shows lesson cards with testids', () => {
  assert.ok(
    academySrc.includes('data-testid="academy-lesson-'),
    'Each lesson card must have a data-testid'
  );
});

test('Academy: renderer supports locked/complete/available states', () => {
  assert.ok(
    academySrc.includes('locked') && academySrc.includes('complete') && academySrc.includes('available'),
    'Renderer must support locked, complete, and available lesson states'
  );
  assert.ok(
    academySrc.includes('isLocked'),
    'Renderer must compute isLocked state (sequential unlock)'
  );
});

test('Academy: findLesson helper exists', () => {
  assert.ok(
    academySrc.includes('export function findLesson'),
    'Must export findLesson helper'
  );
});

// ── Route integration ──

test('Router: /play/academy is in LANDING_MODES', () => {
  assert.ok(
    routerSrc.includes("'/play/academy'"),
    'Router must include /play/academy in LANDING_MODES'
  );
});

test('PlayApp: academy route handler exists', () => {
  assert.ok(
    playAppSrc.includes("sub === '/academy'"),
    'Play app must handle /academy sub-route'
  );
  assert.ok(
    playAppSrc.includes('renderAcademyHub'),
    'Play app must have renderAcademyHub function'
  );
});

test('PlayApp: startAcademyLesson function exists', () => {
  assert.ok(
    playAppSrc.includes('async function startAcademyLesson'),
    'Play app must have startAcademyLesson function'
  );
  assert.ok(
    playAppSrc.includes('state.academyLessonId'),
    'startAcademyLesson must set academyLessonId on state'
  );
});

test('PlayApp: academy lesson completion on win', () => {
  assert.ok(
    playAppSrc.includes('markLessonComplete(state.academyLessonId)'),
    'Play app must mark lesson complete on win'
  );
  assert.ok(
    playAppSrc.includes("snapshot.state?.winner === humanId"),
    'Lesson completion must check winner matches human player'
  );
});

test('PlayApp: academy sets guidance mode to GUIDED', () => {
  assert.ok(
    playAppSrc.includes('state.guidanceMode = GuidanceMode.GUIDED'),
    'Academy lessons must enable GUIDED mode for layered explanations'
  );
});

// ── Hub integration ──

test('Hub: Academy entry link on new match page', () => {
  assert.ok(
    hubSrc.includes('academy-entry-link'),
    'New match page must have Academy entry link'
  );
  assert.ok(
    hubSrc.includes('#/play/academy'),
    'Academy entry link must point to #/play/academy'
  );
  assert.ok(
    hubSrc.includes('data-testid="academy-entry-link"'),
    'Academy entry link must have data-testid'
  );
});

// ── SEO ──

test('SEO: Academy page has metadata', () => {
  assert.ok(
    seoSrc.includes("'/play/academy'"),
    'SEO metadata must include /play/academy route'
  );
  assert.ok(
    seoSrc.includes('Academy'),
    'SEO metadata must have Academy title'
  );
});

// ── CSS ──

test('CSS: Academy styles exist', () => {
  assert.ok(cssSrc.includes('.academy'), 'CSS must have .academy styles');
  assert.ok(cssSrc.includes('.academy-lesson-card'), 'CSS must have .academy-lesson-card styles');
  assert.ok(cssSrc.includes('.academy-progress-fill'), 'CSS must have .academy-progress-fill styles');
  assert.ok(cssSrc.includes('.academy-entry-link'), 'CSS must have .academy-entry-link styles');
});
