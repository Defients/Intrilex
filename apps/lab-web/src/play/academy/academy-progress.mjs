// ═══════════════════════════════════════════════════════════════
// academy-progress.mjs — Academy 2.0 progress persistence
//
// v2 progress shape (localStorage key: 'intrilex:academy-progress-v2'):
//   {
//     version: 2,
//     tiers: { foundations: { unlocked, completed }, mechanics: {...}, applied: {...} },
//     lessons: { '<lessonId>': { status, completedAt, attempts, hintsUsed, retries,
//                                objectivesMet, masteryScore } },
//     graduationAssessment: null,  // Phase 3
//   }
//
// v1 → v2 migration:
//   v1 was a flat array of completed lesson IDs under key
//   'intrilex:academy-progress'. Each v1 id maps via V1_TO_V2_LESSON_MAP
//   to a v2 lesson id. After successful migration the v1 key is removed.
//
// Tier unlock logic:
//   - foundations is always unlocked
//   - a tier unlocks when the previous tier is completed (all its lessons
//     completed)
//   - within a tier, lessons unlock sequentially (lesson N unlocks when
//     lesson N-1 in the same tier is completed). The first lesson of an
//     unlocked tier is always available.
// ═══════════════════════════════════════════════════════════════
import {
  CURRICULUM,
  TIERS,
  TierId,
  V1_TO_V2_LESSON_MAP,
  curriculumByTier,
  findLesson,
  lessonIdsForTier,
  allLessonIds,
} from './curriculum.mjs';

/** localStorage keys */
export const V2_KEY = 'intrilex:academy-progress-v2';
export const V1_KEY = 'intrilex:academy-progress';

/** Lesson status values */
export const LessonStatus = Object.freeze({
  LOCKED: 'locked',
  AVAILABLE: 'available',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
});

/** Current progress schema version */
export const PROGRESS_VERSION = 2;

/**
 * Build a fresh empty v2 progress object with foundations unlocked.
 * @returns {object}
 */
export function freshProgress() {
  const tiers = {};
  for (const t of TIERS) {
    tiers[t.id] = { unlocked: t.id === TierId.FOUNDATIONS, completed: false };
  }
  const lessons = {};
  for (const id of allLessonIds()) {
    lessons[id] = {
      status: LessonStatus.LOCKED,
      completedAt: null,
      attempts: 0,
      hintsUsed: 0,
      retries: 0,
      objectivesMet: [],
      masteryScore: null,
      completionCount: 0, // Phase 3: number of times completed (for mastery reps)
    };
  }
  // First lesson of foundations is available
  const firstFoundations = lessonIdsForTier(TierId.FOUNDATIONS)[0];
  if (firstFoundations) lessons[firstFoundations].status = LessonStatus.AVAILABLE;
  return {
    version: PROGRESS_VERSION,
    tiers,
    lessons,
    graduationAssessment: null,
  };
}

/**
 * Read a JSON value from localStorage, returning null on any error.
 * @param {string} key
 * @returns {any|null}
 */
function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write a JSON value to localStorage, swallowing quota/availability errors.
 * @param {string} key
 * @param {any} value
 * @returns {boolean} true if written
 */
function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Migrate a v1 progress array (list of completed lesson ids) into a v2
 * progress object. Unknown v1 ids are silently dropped.
 * @param {string[]} v1Completed
 * @returns {object} v2 progress
 */
export function migrateFromV1(v1Completed) {
  const progress = freshProgress();
  if (!Array.isArray(v1Completed)) return progress;
  for (const v1Id of v1Completed) {
    const v2Id = V1_TO_V2_LESSON_MAP[v1Id];
    if (!v2Id) continue; // unknown legacy id — drop
    if (!progress.lessons[v2Id]) continue; // mapped id no longer in curriculum
    progress.lessons[v2Id].status = LessonStatus.COMPLETED;
    progress.lessons[v2Id].completedAt = Date.now();
    progress.lessons[v2Id].attempts = 1;
    progress.lessons[v2Id].masteryScore = 1.0;
    progress.lessons[v2Id].objectivesMet = findLesson(v2Id)?.completion.requiredObjectives ?? [];
  }
  recomputeTierState(progress);
  recomputeLessonUnlockState(progress);
  return progress;
}

/**
 * Recompute tier unlocked/completed flags from lesson completion state.
 * Mutates `progress` in place.
 * @param {object} progress
 */
export function recomputeTierState(progress) {
  const byTier = curriculumByTier();
  let previousCompleted = true; // foundations unlocks unconditionally
  for (const tier of byTier) {
    const ids = tier.lessons.map((l) => l.id);
    const allDone = ids.length > 0 && ids.every((id) =>
      progress.lessons[id]?.status === LessonStatus.COMPLETED);
    progress.tiers[tier.id].completed = allDone;
    progress.tiers[tier.id].unlocked = previousCompleted;
    previousCompleted = allDone;
  }
}

/**
 * Recompute per-lesson status (locked/available) from tier + sequential
 * unlock rules. Completed lessons keep their COMPLETED status; in-progress
 * lessons keep IN_PROGRESS. Only LOCKED/AVAILABLE are recomputed.
 * Mutates `progress` in place.
 * @param {object} progress
 */
export function recomputeLessonUnlockState(progress) {
  const byTier = curriculumByTier();
  for (const tier of byTier) {
    const tierUnlocked = progress.tiers[tier.id]?.unlocked === true;
    let prevCompleted = true; // first lesson of an unlocked tier is available
    for (const lesson of tier.lessons) {
      const entry = progress.lessons[lesson.id];
      if (!entry) continue;
      if (entry.status === LessonStatus.COMPLETED || entry.status === LessonStatus.IN_PROGRESS) {
        prevCompleted = entry.status === LessonStatus.COMPLETED;
        continue;
      }
      if (!tierUnlocked) {
        entry.status = LessonStatus.LOCKED;
      } else if (prevCompleted) {
        entry.status = LessonStatus.AVAILABLE;
      } else {
        entry.status = LessonStatus.LOCKED;
      }
      prevCompleted = false; // not completed
    }
  }
}

/**
 * Sanitize/upgrade an arbitrary parsed object into a well-formed v2
 * progress object. Fills missing tiers/lessons, coerces bad values.
 * @param {any} raw
 * @returns {object} v2 progress
 */
export function normalizeProgress(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== PROGRESS_VERSION) {
    // If it looks like a v1 array, migrate; otherwise start fresh.
    if (Array.isArray(raw)) return migrateFromV1(raw);
    return freshProgress();
  }
  const progress = freshProgress();
  // Preserve tier flags but recompute them at the end
  if (raw.tiers && typeof raw.tiers === 'object') {
    for (const t of TIERS) {
      if (raw.tiers[t.id] && typeof raw.tiers[t.id] === 'object') {
        progress.tiers[t.id].completed = raw.tiers[t.id].completed === true;
      }
    }
  }
  if (raw.lessons && typeof raw.lessons === 'object') {
    for (const id of allLessonIds()) {
      const src = raw.lessons[id];
      if (!src || typeof src !== 'object') continue;
      const dst = progress.lessons[id];
      if (typeof src.completedAt === 'number') dst.completedAt = src.completedAt;
      if (typeof src.attempts === 'number') dst.attempts = src.attempts;
      if (typeof src.hintsUsed === 'number') dst.hintsUsed = src.hintsUsed;
      if (typeof src.retries === 'number') dst.retries = src.retries;
      if (Array.isArray(src.objectivesMet)) dst.objectivesMet = src.objectivesMet.filter((x) => typeof x === 'string');
      if (typeof src.masteryScore === 'number') dst.masteryScore = src.masteryScore;
      if (typeof src.completionCount === 'number') dst.completionCount = src.completionCount;
      if (src.status === LessonStatus.COMPLETED) dst.status = LessonStatus.COMPLETED;
      else if (src.status === LessonStatus.IN_PROGRESS) dst.status = LessonStatus.IN_PROGRESS;
    }
  }
  if (raw.graduationAssessment !== undefined) {
    progress.graduationAssessment = raw.graduationAssessment ?? null;
  }
  recomputeTierState(progress);
  recomputeLessonUnlockState(progress);
  return progress;
}

/**
 * Load v2 progress from localStorage, migrating from v1 if needed.
 * After a successful migration the v1 key is removed.
 * @returns {object} v2 progress (never null)
 */
export function loadProgress() {
  const v2 = readJson(V2_KEY);
  if (v2 && typeof v2 === 'object' && v2.version === PROGRESS_VERSION) {
    return normalizeProgress(v2);
  }
  // Try v1 migration
  const v1 = readJson(V1_KEY);
  if (v1 !== null) {
    const migrated = Array.isArray(v1) ? migrateFromV1(v1) : freshProgress();
    if (writeJson(V2_KEY, migrated)) {
      // Remove v1 key only after v2 is durably written
      try { localStorage.removeItem(V1_KEY); } catch { /* ignore */ }
    }
    return migrated;
  }
  return freshProgress();
}

/**
 * Persist v2 progress to localStorage.
 * @param {object} progress
 * @returns {boolean} true if written
 */
export function saveProgress(progress) {
  const normalized = normalizeProgress(progress);
  return writeJson(V2_KEY, normalized);
}

/**
 * Mark a lesson as completed. Increments attempts if not already completed,
 * sets completedAt, recomputes tier + unlock state, and persists.
 * @param {string} lessonId
 * @param {{ objectivesMet?: string[], hintsUsed?: number, retries?: number, masteryScore?: number }} [meta]
 * @returns {object} the updated progress
 */
export function markLessonComplete(lessonId, meta = {}) {
  const progress = loadProgress();
  const entry = progress.lessons[lessonId];
  if (!entry) return progress; // unknown lesson — no-op
  const wasCompleted = entry.status === LessonStatus.COMPLETED;
  entry.status = LessonStatus.COMPLETED;
  entry.completedAt = Date.now();
  if (!wasCompleted) entry.attempts = (entry.attempts ?? 0) + 1;
  // Phase 3: increment completion count (for mastery rep tracking)
  entry.completionCount = (entry.completionCount ?? 0) + 1;
  if (Array.isArray(meta.objectivesMet)) {
    const set = new Set([...(entry.objectivesMet ?? []), ...meta.objectivesMet]);
    entry.objectivesMet = [...set];
  }
  if (typeof meta.hintsUsed === 'number') entry.hintsUsed = meta.hintsUsed;
  if (typeof meta.retries === 'number') entry.retries = meta.retries;
  if (typeof meta.masteryScore === 'number') {
    // Keep the best mastery score across replays
    const prev = entry.masteryScore;
    entry.masteryScore = prev == null ? meta.masteryScore : Math.max(prev, meta.masteryScore);
  } else if (entry.masteryScore == null) {
    entry.masteryScore = 1.0;
  }
  recomputeTierState(progress);
  recomputeLessonUnlockState(progress);
  saveProgress(progress);
  return progress;
}

/**
 * Record an attempt on a lesson (started or failed). Increments attempts
 * and sets status to IN_PROGRESS if it was AVAILABLE/LOCKED. Does NOT
 * mark complete.
 * @param {string} lessonId
 * @returns {object} the updated progress
 */
export function recordLessonAttempt(lessonId) {
  const progress = loadProgress();
  const entry = progress.lessons[lessonId];
  if (!entry) return progress;
  if (entry.status === LessonStatus.AVAILABLE || entry.status === LessonStatus.LOCKED) {
    entry.status = LessonStatus.IN_PROGRESS;
    entry.attempts = (entry.attempts ?? 0) + 1;
  }
  saveProgress(progress);
  return progress;
}

/**
 * Record a retry on a lesson (re-attempt after failure). Increments retries.
 * @param {string} lessonId
 * @returns {object} the updated progress
 */
export function recordLessonRetry(lessonId) {
  const progress = loadProgress();
  const entry = progress.lessons[lessonId];
  if (!entry) return progress;
  entry.retries = (entry.retries ?? 0) + 1;
  saveProgress(progress);
  return progress;
}

/**
 * Record hints used on a lesson.
 * @param {string} lessonId
 * @param {number} count
 * @returns {object} the updated progress
 */
export function recordHintsUsed(lessonId, count) {
  const progress = loadProgress();
  const entry = progress.lessons[lessonId];
  if (!entry) return progress;
  entry.hintsUsed = (entry.hintsUsed ?? 0) + Math.max(0, count | 0);
  saveProgress(progress);
  return progress;
}

/**
 * Get the list of completed lesson ids (v2 shape). Backward-compatible
 * with the v1 `getCompletedLessons()` return type.
 * @returns {string[]}
 */
export function getCompletedLessonIds() {
  const progress = loadProgress();
  return allLessonIds().filter((id) => progress.lessons[id]?.status === LessonStatus.COMPLETED);
}

/**
 * Is a tier unlocked for the given (or current) progress?
 * @param {string} tierId
 * @param {object} [progress] — defaults to loaded progress
 * @returns {boolean}
 */
export function isTierUnlocked(tierId, progress) {
  const p = progress ?? loadProgress();
  return p.tiers[tierId]?.unlocked === true;
}

/**
 * Is a tier completed (all its lessons completed)?
 * @param {string} tierId
 * @param {object} [progress]
 * @returns {boolean}
 */
export function isTierCompleted(tierId, progress) {
  const p = progress ?? loadProgress();
  return p.tiers[tierId]?.completed === true;
}

/**
 * Is a specific lesson available to start (not locked)?
 * @param {string} lessonId
 * @param {object} [progress]
 * @returns {boolean}
 */
export function isLessonAvailable(lessonId, progress) {
  const p = progress ?? loadProgress();
  const s = p.lessons[lessonId]?.status;
  return s === LessonStatus.AVAILABLE || s === LessonStatus.IN_PROGRESS || s === LessonStatus.COMPLETED;
}

/**
 * Is a specific lesson completed?
 * @param {string} lessonId
 * @param {object} [progress]
 * @returns {boolean}
 */
export function isLessonCompleted(lessonId, progress) {
  const p = progress ?? loadProgress();
  return p.lessons[lessonId]?.status === LessonStatus.COMPLETED;
}

/**
 * Is a specific lesson locked?
 * @param {string} lessonId
 * @param {object} [progress]
 * @returns {boolean}
 */
export function isLessonLocked(lessonId, progress) {
  const p = progress ?? loadProgress();
  return p.lessons[lessonId]?.status === LessonStatus.LOCKED;
}

/**
 * Overall completion fraction across the whole curriculum.
 * @param {object} [progress]
 * @returns {{ completed: number, total: number, pct: number }}
 */
export function overallProgress(progress) {
  const p = progress ?? loadProgress();
  const total = CURRICULUM.length;
  const completed = allLessonIds().filter((id) => p.lessons[id]?.status === LessonStatus.COMPLETED).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, pct };
}

/**
 * Per-tier completion summary for hub rendering.
 * @param {object} [progress]
 * @returns {{ id: string, name: string, order: number, unlocked: boolean, completed: boolean, completedCount: number, total: number }[]}
 */
export function tierSummaries(progress) {
  const p = progress ?? loadProgress();
  return curriculumByTier().map((t) => {
    const ids = t.lessons.map((l) => l.id);
    const completedCount = ids.filter((id) => p.lessons[id]?.status === LessonStatus.COMPLETED).length;
    return {
      id: t.id,
      name: t.name,
      order: t.order,
      unlocked: p.tiers[t.id]?.unlocked === true,
      completed: p.tiers[t.id]?.completed === true,
      completedCount,
      total: ids.length,
    };
  });
}

/**
 * Has the player completed all foundations-tier lessons? Used by the
 * first-run funnel TUTORIAL_COMPLETE step.
 * @param {object} [progress]
 * @returns {boolean}
 */
export function isFoundationsComplete(progress) {
  return isTierCompleted(TierId.FOUNDATIONS, progress);
}

/**
 * Has the player graduated the entire Academy (all tiers complete)?
 * @param {object} [progress]
 * @returns {boolean}
 */
export function isAcademyComplete(progress) {
  const p = progress ?? loadProgress();
  return TIERS.every((t) => p.tiers[t.id]?.completed === true);
}
