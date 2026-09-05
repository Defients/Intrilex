// ═══════════════════════════════════════════════════════════════
// puzzle-progress.mjs — Puzzle ladder progress tracking
//
// Tracks solved puzzles in localStorage. Progress is persisted across
// sessions so players can see their puzzle ladder completion.
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'intrilex:puzzle-progress';

/**
 * Get the full puzzle progress object from localStorage.
 * @returns {{ solved: string[], attempts: Record<string, number> }}
 */
export function getPuzzleProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { solved: [], attempts: {} };
    const parsed = JSON.parse(raw);
    return {
      solved: Array.isArray(parsed.solved) ? parsed.solved : [],
      attempts: typeof parsed.attempts === 'object' && parsed.attempts !== null ? parsed.attempts : {},
    };
  } catch {
    return { solved: [], attempts: {} };
  }
}

/**
 * Check if a puzzle has been solved.
 * @param {string} puzzleId
 * @returns {boolean}
 */
export function isPuzzleSolved(puzzleId) {
  return getPuzzleProgress().solved.includes(puzzleId);
}

/**
 * Record a puzzle attempt. Increments the attempt counter and marks as solved
 * if the result was a success.
 * @param {string} puzzleId
 * @param {'success'|'failure'|'abandoned'} result
 */
export function recordPuzzleAttempt(puzzleId, result) {
  try {
    const progress = getPuzzleProgress();
    progress.attempts[puzzleId] = (progress.attempts[puzzleId] ?? 0) + 1;
    if (result === 'success' && !progress.solved.includes(puzzleId)) {
      progress.solved.push(puzzleId);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch { /* localStorage unavailable */ }
}

/**
 * Get the number of solved puzzles.
 * @param {string[]} allPuzzleIds - All known puzzle IDs
 * @returns {number}
 */
export function getSolvedCount(allPuzzleIds) {
  const solved = getPuzzleProgress().solved;
  return allPuzzleIds.filter(id => solved.includes(id)).length;
}

// ── v0.30.0: Puzzle → Lesson recommendation engine ───────────
//
// Maps puzzle IDs to Academy lesson IDs. When a player struggles with
// a puzzle (multiple failed attempts), the engine recommends the
// corresponding Academy lesson to strengthen that mechanic.

const PUZZLE_TO_LESSON_MAP = Object.freeze({
  'puzzle-scuttle': 'mechanics-01-scuttle',
  'puzzle-anchor': 'mechanics-02-anchor',
  'puzzle-swap': 'mechanics-03-swap',
  'puzzle-respond': 'mechanics-04-respond',
  'puzzle-counter': 'mechanics-04-respond',
  'puzzle-royals': 'applied-01-royals',
  'puzzle-combo': 'applied-02-combo',
  'puzzle-draw': 'foundations-01-draw',
  'puzzle-score': 'foundations-02-score',
  'puzzle-goal': 'foundations-03-goal',
});

/**
 * Get recommended Academy lessons based on puzzle performance.
 * A lesson is recommended if the player has 2+ failed attempts on
 * a puzzle that maps to that lesson, and the lesson is not yet complete.
 * @param {string[]} completedLessonIds - Lessons already completed
 * @returns {Array<{ lessonId: string, puzzleId: string, reason: string }>}
 */
export function getRecommendedLessons(completedLessonIds = []) {
  const progress = getPuzzleProgress();
  const completed = new Set(completedLessonIds);
  const recommendations = [];
  const seen = new Set();

  for (const [puzzleId, lessonId] of Object.entries(PUZZLE_TO_LESSON_MAP)) {
    if (completed.has(lessonId)) continue;
    if (seen.has(lessonId)) continue;
    const attempts = progress.attempts[puzzleId] ?? 0;
    const solved = progress.solved.includes(puzzleId);
    // Recommend if player has 2+ failed attempts and hasn't solved the puzzle
    if (attempts >= 2 && !solved) {
      seen.add(lessonId);
      recommendations.push({
        lessonId,
        puzzleId,
        reason: `You've attempted "${puzzleId}" ${attempts} times. This lesson can help.`,
      });
    }
  }

  return recommendations;
}
