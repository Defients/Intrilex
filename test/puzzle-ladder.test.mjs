// ═══════════════════════════════════════════════════════════════
// puzzle-ladder.test.mjs — Puzzle ladder promotion tests
//
// Tests that the puzzle system is promoted to a player-facing route,
// progress tracking works, and the Academy links to it.
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/router.js'), 'utf8');
const appSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/app.js'), 'utf8');
const academySrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/academy/academy-renderer.mjs'), 'utf8');
const puzzleAppSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/puzzle/puzzle-app.mjs'), 'utf8');
const puzzleProgressSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/puzzle/puzzle-progress.mjs'), 'utf8');
const seoSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/seo-metadata.js'), 'utf8');
const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-v3.css'), 'utf8');

// ── Route promotion ──

test('Router: /puzzles is in LANDING_MODES', () => {
  assert.ok(
    routerSrc.includes("'/puzzles'"),
    'Router must include /puzzles in LANDING_MODES'
  );
});

test('App: /puzzles route renders puzzle module', () => {
  assert.ok(
    appSrc.includes("r === '/dev/puzzles' || r === '/puzzles'"),
    'App must handle /puzzles route (alongside /dev/puzzles for backward compat)'
  );
});

test('App: /dev/puzzles still works for backward compat', () => {
  assert.ok(
    appSrc.includes("'/dev/puzzles'"),
    'App must still handle /dev/puzzles for backward compatibility'
  );
});

// ── Progress tracking ──

test('Puzzle progress: module exists with tracking functions', () => {
  assert.ok(
    puzzleProgressSrc.includes('export function getPuzzleProgress'),
    'puzzle-progress.mjs must export getPuzzleProgress'
  );
  assert.ok(
    puzzleProgressSrc.includes('export function recordPuzzleAttempt'),
    'puzzle-progress.mjs must export recordPuzzleAttempt'
  );
  assert.ok(
    puzzleProgressSrc.includes('export function isPuzzleSolved'),
    'puzzle-progress.mjs must export isPuzzleSolved'
  );
});

test('Puzzle progress: stored in localStorage under correct key', () => {
  assert.ok(
    puzzleProgressSrc.includes("'intrilex:puzzle-progress'"),
    'Progress must be stored under intrilex:puzzle-progress key'
  );
});

test('Puzzle progress: recordPuzzleAttempt tracks attempts and solved', () => {
  assert.ok(
    puzzleProgressSrc.includes('attempts[puzzleId]'),
    'recordPuzzleAttempt must track attempt count per puzzle'
  );
  assert.ok(
    puzzleProgressSrc.includes("'success'") && puzzleProgressSrc.includes('solved'),
    'recordPuzzleAttempt must mark solved on success'
  );
});

// ── Puzzle app integration ──

test('Puzzle app: imports progress tracking module', () => {
  assert.ok(
    puzzleAppSrc.includes('puzzle-progress.mjs'),
    'puzzle-app.mjs must import puzzle-progress module'
  );
});

test('Puzzle app: records attempts on win/fail', () => {
  assert.ok(
    puzzleAppSrc.includes('recordPuzzleAttempt'),
    'puzzle-app.mjs must call recordPuzzleAttempt'
  );
  assert.ok(
    puzzleAppSrc.includes('PuzzleResultKind.SUCCESS') && puzzleAppSrc.includes('PuzzleResultKind.FAILURE'),
    'puzzle-app.mjs must check for SUCCESS and FAILURE results'
  );
});

test('Puzzle app: passes progress to renderer', () => {
  assert.ok(
    puzzleAppSrc.includes('puzzleProgress'),
    'puzzle-app.mjs must pass puzzleProgress to the renderer'
  );
});

// ── Academy integration ──

test('Academy: links to puzzle ladder', () => {
  assert.ok(
    academySrc.includes('#/puzzles'),
    'Academy page must link to #/puzzles'
  );
  assert.ok(
    academySrc.includes('data-testid="academy-puzzle-link"'),
    'Academy puzzle link must have data-testid'
  );
});

// ── SEO ──

test('SEO: /puzzles page has metadata', () => {
  assert.ok(
    seoSrc.includes("'/puzzles'"),
    'SEO metadata must include /puzzles route'
  );
  assert.ok(
    seoSrc.includes('Puzzle Ladder'),
    'SEO metadata must mention Puzzle Ladder'
  );
});

// ── CSS ──

test('CSS: academy puzzle link styles exist', () => {
  assert.ok(
    cssSrc.includes('.academy-puzzle-link'),
    'CSS must have .academy-puzzle-link styles'
  );
});
