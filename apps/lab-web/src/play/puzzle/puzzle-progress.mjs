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
