// ═══════════════════════════════════════════════════════════════
// forensic-model.mjs — Pure forensic replay model
//
// Framework-agnostic pure functions for managing bookmarks, branches,
// annotations, and comparisons on certified replay data.
//
// All functions are pure: they take plain data and return plain data.
// No DOM, no IndexedDB, no side effects. This separation ensures the
// model can be reused by React/TypeScript consolidation without
// reimplementing the replay model.
//
// Data shapes:
//   Bookmark    — { id, replayId, frameIndex, label, note, createdAt }
//   Branch      — { id, replayId, parentFrameIndex, alternateCommands,
//                   label, note, createdAt, frames? }
//   Annotation  — { id, replayId, frameIndex, text, createdAt }
//   Comparison  — { id, label, entries: [{replayId, frameIndex, label}],
//                   createdAt }
//   ForensicSession — { replayId, bookmarks, branches, annotations,
//                        comparisons, schemaVersion }
// ═══════════════════════════════════════════════════════════════

export const FORENSIC_SCHEMA_VERSION = 1;

/** Maximum annotation text length (prevents storage abuse). */
export const MAX_ANNOTATION_LENGTH = 2000;
/** Maximum bookmark label length. */
export const MAX_BOOKMARK_LABEL_LENGTH = 200;
/** Maximum bookmark note length. */
export const MAX_BOOKMARK_NOTE_LENGTH = 1000;
/** Maximum branch label length. */
export const MAX_BRANCH_LABEL_LENGTH = 200;

let _idCounter = 0;

/**
 * Generate a unique ID for forensic entities.
 * Uses crypto.randomUUID when available, falls back to timestamp+counter.
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  _idCounter += 1;
  return `f-${Date.now().toString(36)}-${_idCounter.toString(36)}`;
}

// ── ForensicSession ─────────────────────────────────────────────

/**
 * Create an empty forensic session for a replay.
 * @param {string} replayId
 * @returns {ForensicSession}
 */
export function createForensicSession(replayId) {
  if (!replayId || typeof replayId !== 'string') {
    throw new Error('FORENSIC_INVALID_REPLAY_ID');
  }
  return {
    schemaVersion: FORENSIC_SCHEMA_VERSION,
    replayId,
    bookmarks: [],
    branches: [],
    annotations: [],
    comparisons: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Validate a forensic session object.
 * @param {ForensicSession} session
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateForensicSession(session) {
  const errors = [];
  if (!session || typeof session !== 'object') {
    return { valid: false, errors: ['Session is not an object'] };
  }
  if (session.schemaVersion !== FORENSIC_SCHEMA_VERSION) {
    errors.push(`Schema version mismatch: expected ${FORENSIC_SCHEMA_VERSION}, got ${session.schemaVersion}`);
  }
  if (!session.replayId || typeof session.replayId !== 'string') {
    errors.push('Missing or invalid replayId');
  }
  if (!Array.isArray(session.bookmarks)) errors.push('bookmarks must be an array');
  if (!Array.isArray(session.branches)) errors.push('branches must be an array');
  if (!Array.isArray(session.annotations)) errors.push('annotations must be an array');
  if (!Array.isArray(session.comparisons)) errors.push('comparisons must be an array');
  return { valid: errors.length === 0, errors };
}

/**
 * Mark a session as updated (bump updatedAt timestamp).
 * @param {ForensicSession} session
 * @returns {ForensicSession}
 */
function touch(session) {
  return { ...session, updatedAt: new Date().toISOString() };
}

// ── Bookmarks ───────────────────────────────────────────────────

/**
 * Add a bookmark to a forensic session.
 * @param {ForensicSession} session
 * @param {{ frameIndex: number, label?: string, note?: string }} opts
 * @returns {ForensicSession}
 */
export function addBookmark(session, { frameIndex, label = '', note = '' }) {
  if (typeof frameIndex !== 'number' || frameIndex < 0) {
    throw new Error('FORENSIC_INVALID_FRAME_INDEX');
  }
  const truncatedLabel = String(label).slice(0, MAX_BOOKMARK_LABEL_LENGTH);
  const truncatedNote = String(note).slice(0, MAX_BOOKMARK_NOTE_LENGTH);
  const bookmark = {
    id: generateId(),
    replayId: session.replayId,
    frameIndex,
    label: truncatedLabel,
    note: truncatedNote,
    createdAt: new Date().toISOString(),
  };
  return touch({
    ...session,
    bookmarks: [...session.bookmarks, bookmark],
  });
}

/**
 * Remove a bookmark by ID.
 * @param {ForensicSession} session
 * @param {string} bookmarkId
 * @returns {ForensicSession}
 */
export function removeBookmark(session, bookmarkId) {
  return touch({
    ...session,
    bookmarks: session.bookmarks.filter(b => b.id !== bookmarkId),
  });
}

/**
 * Update a bookmark's label or note.
 * @param {ForensicSession} session
 * @param {string} bookmarkId
 * @param {{ label?: string, note?: string }} updates
 * @returns {ForensicSession}
 */
export function updateBookmark(session, bookmarkId, { label, note }) {
  return touch({
    ...session,
    bookmarks: session.bookmarks.map(b =>
      b.id === bookmarkId
        ? { ...b, label: label ?? b.label, note: note ?? b.note }
        : b
    ),
  });
}

/**
 * Get bookmarks sorted by frame index.
 * @param {ForensicSession} session
 * @returns {Bookmark[]}
 */
export function sortedBookmarks(session) {
  return [...session.bookmarks].sort((a, b) => a.frameIndex - b.frameIndex);
}

/**
 * Find a bookmark at or near a frame index.
 * @param {ForensicSession} session
 * @param {number} frameIndex
 * @param {number} [tolerance=0]
 * @returns {Bookmark|null}
 */
export function findBookmarkAtFrame(session, frameIndex, tolerance = 0) {
  return session.bookmarks.find(b =>
    Math.abs(b.frameIndex - frameIndex) <= tolerance
  ) ?? null;
}

// ── Branches (alternate-line exploration) ───────────────────────

/**
 * Create a branch from a specific frame in the replay.
 * The branch records the parent frame index and an alternate command
 * sequence that diverges from the original replay at that point.
 *
 * The actual frame reconstruction (re-executing alternate commands
 * against the engine) is performed separately by the caller and stored
 * in the branch's `frames` field. This keeps the model pure.
 *
 * @param {ForensicSession} session
 * @param {{ parentFrameIndex: number, alternateCommands: object[], label?: string, note?: string }} opts
 * @returns {ForensicSession}
 */
export function addBranch(session, { parentFrameIndex, alternateCommands, label = '', note = '' }) {
  if (typeof parentFrameIndex !== 'number' || parentFrameIndex < 0) {
    throw new Error('FORENSIC_INVALID_FRAME_INDEX');
  }
  if (!Array.isArray(alternateCommands)) {
    throw new Error('FORENSIC_INVALID_COMMANDS');
  }
  const truncatedLabel = String(label).slice(0, MAX_BRANCH_LABEL_LENGTH);
  const branch = {
    id: generateId(),
    replayId: session.replayId,
    parentFrameIndex,
    alternateCommands,
    label: truncatedLabel,
    note,
    frames: null, // Populated by caller after engine reconstruction
    createdAt: new Date().toISOString(),
  };
  return touch({
    ...session,
    branches: [...session.branches, branch],
  });
}

/**
 * Remove a branch by ID.
 * @param {ForensicSession} session
 * @param {string} branchId
 * @returns {ForensicSession}
 */
export function removeBranch(session, branchId) {
  return touch({
    ...session,
    branches: session.branches.filter(b => b.id !== branchId),
  });
}

/**
 * Attach reconstructed frames to a branch.
 * @param {ForensicSession} session
 * @param {string} branchId
 * @param {object[]} frames
 * @returns {ForensicSession}
 */
export function attachBranchFrames(session, branchId, frames) {
  return touch({
    ...session,
    branches: session.branches.map(b =>
      b.id === branchId ? { ...b, frames } : b
    ),
  });
}

/**
 * Get branches that diverge from a specific frame.
 * @param {ForensicSession} session
 * @param {number} frameIndex
 * @returns {Branch[]}
 */
export function branchesAtFrame(session, frameIndex) {
  return session.branches.filter(b => b.parentFrameIndex === frameIndex);
}

// ── Annotations ─────────────────────────────────────────────────

/**
 * Add an annotation to a specific frame.
 * @param {ForensicSession} session
 * @param {{ frameIndex: number, text: string }} opts
 * @returns {ForensicSession}
 */
export function addAnnotation(session, { frameIndex, text }) {
  if (typeof frameIndex !== 'number' || frameIndex < 0) {
    throw new Error('FORENSIC_INVALID_FRAME_INDEX');
  }
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('FORENSIC_INVALID_ANNOTATION_TEXT');
  }
  const truncatedText = text.slice(0, MAX_ANNOTATION_LENGTH);
  const annotation = {
    id: generateId(),
    replayId: session.replayId,
    frameIndex,
    text: truncatedText,
    createdAt: new Date().toISOString(),
  };
  return touch({
    ...session,
    annotations: [...session.annotations, annotation],
  });
}

/**
 * Remove an annotation by ID.
 * @param {ForensicSession} session
 * @param {string} annotationId
 * @returns {ForensicSession}
 */
export function removeAnnotation(session, annotationId) {
  return touch({
    ...session,
    annotations: session.annotations.filter(a => a.id !== annotationId),
  });
}

/**
 * Get annotations for a specific frame, sorted by creation time.
 * @param {ForensicSession} session
 * @param {number} frameIndex
 * @returns {Annotation[]}
 */
export function annotationsAtFrame(session, frameIndex) {
  return session.annotations
    .filter(a => a.frameIndex === frameIndex)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ── Comparisons ─────────────────────────────────────────────────

/**
 * Create a comparison set referencing multiple replay positions.
 * @param {ForensicSession} session
 * @param {{ label: string, entries: {replayId: string, frameIndex: number, label?: string}[] }} opts
 * @returns {ForensicSession}
 */
export function addComparison(session, { label, entries }) {
  if (!label || typeof label !== 'string') {
    throw new Error('FORENSIC_INVALID_COMPARISON_LABEL');
  }
  if (!Array.isArray(entries) || entries.length < 2) {
    throw new Error('FORENSIC_INVALID_COMPARISON_ENTRIES');
  }
  for (const e of entries) {
    if (!e.replayId || typeof e.frameIndex !== 'number') {
      throw new Error('FORENSIC_INVALID_COMPARISON_ENTRY');
    }
  }
  const comparison = {
    id: generateId(),
    label,
    entries: entries.map(e => ({ ...e, label: e.label ?? '' })),
    createdAt: new Date().toISOString(),
  };
  return touch({
    ...session,
    comparisons: [...session.comparisons, comparison],
  });
}

/**
 * Remove a comparison by ID.
 * @param {ForensicSession} session
 * @param {string} comparisonId
 * @returns {ForensicSession}
 */
export function removeComparison(session, comparisonId) {
  return touch({
    ...session,
    comparisons: session.comparisons.filter(c => c.id !== comparisonId),
  });
}

// ── Query helpers ───────────────────────────────────────────────

/**
 * Get a summary of forensic activity at a specific frame.
 * @param {ForensicSession} session
 * @param {number} frameIndex
 * @returns {{ hasBookmark: boolean, bookmarkCount: number, branchCount: number, annotationCount: number }}
 */
export function frameSummary(session, frameIndex) {
  const bookmarks = session.bookmarks.filter(b => b.frameIndex === frameIndex);
  const branches = session.branches.filter(b => b.parentFrameIndex === frameIndex);
  const annotations = session.annotations.filter(a => a.frameIndex === frameIndex);
  return {
    hasBookmark: bookmarks.length > 0,
    bookmarkCount: bookmarks.length,
    branchCount: branches.length,
    annotationCount: annotations.length,
  };
}

/**
 * Serialize a forensic session to JSON for export.
 * @param {ForensicSession} session
 * @returns {string}
 */
export function exportForensicSession(session) {
  return JSON.stringify({
    format: 'intrilex-forensic-session',
    version: FORENSIC_SCHEMA_VERSION,
    ...session,
  }, null, 2);
}

/**
 * Deserialize a forensic session from JSON.
 * @param {string} json
 * @returns {ForensicSession}
 */
export function importForensicSession(json) {
  const data = JSON.parse(json);
  if (data.format !== 'intrilex-forensic-session') {
    throw new Error('FORENSIC_INVALID_FORMAT');
  }
  const { valid, errors } = validateForensicSession(data);
  if (!valid) {
    throw new Error(`FORENSIC_IMPORT_INVALID: ${errors.join('; ')}`);
  }
  return data;
}
